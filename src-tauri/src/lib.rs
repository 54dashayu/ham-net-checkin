use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;
use base64::Engine;

const LOCAL_HOST: &str = "127.0.0.1:37175";

pub fn run() {
  start_local_webview_server();

  tauri::Builder::default()
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

fn start_local_webview_server() {
  let listener = TcpListener::bind(LOCAL_HOST).expect("failed to bind HAM Check-in WebView server");
  thread::spawn(move || {
    for stream in listener.incoming() {
      if let Ok(stream) = stream {
        thread::spawn(|| handle_client(stream));
      }
    }
  });
}

fn handle_client(mut stream: TcpStream) {
  let request_bytes = match read_http_request(&mut stream) {
    Some(bytes) => bytes,
    None => return,
  };
  let header_end = find_header_end(&request_bytes).unwrap_or(request_bytes.len());
  let request = String::from_utf8_lossy(&request_bytes[..header_end]);
  let body_start = (header_end + 4).min(request_bytes.len());
  let body = &request_bytes[body_start..];
  let mut lines = request.lines();
  let request_line = lines.next().unwrap_or_default();
  let mut parts = request_line.split_whitespace();
  let method = parts.next().unwrap_or_default();
  let raw_path = parts.next().unwrap_or("/");

  if method == "OPTIONS" {
    send_response(&mut stream, 204, "text/plain; charset=utf-8", Vec::new());
    return;
  }

  if method == "GET" && raw_path.starts_with("/mmdvm-proxy?") {
    proxy_mmdvm(&mut stream, raw_path);
    return;
  }

  if method == "GET" && raw_path.starts_with("/api/brandmeister/device?") {
    proxy_brandmeister_device(&mut stream, raw_path);
    return;
  }

  if method == "POST" && raw_path == "/api/checkins" {
    send_response(
      &mut stream,
      200,
      "application/json; charset=utf-8",
      br#"{"ok":true,"recordCount":0,"local":true}"#.to_vec(),
    );
    return;
  }

  if method == "POST" && raw_path == "/api/local-file" {
    save_local_file(&mut stream, body);
    return;
  }

  if method != "GET" && method != "HEAD" {
    send_response(&mut stream, 405, "text/plain; charset=utf-8", b"Method not allowed".to_vec());
    return;
  }

  serve_static(&mut stream, raw_path);
}

fn read_http_request(stream: &mut TcpStream) -> Option<Vec<u8>> {
  let mut request = Vec::new();
  let mut buffer = [0_u8; 16 * 1024];
  let mut header_end = None;
  let max_body = 20 * 1024 * 1024;

  loop {
    let size = stream.read(&mut buffer).ok()?;
    if size == 0 {
      return if request.is_empty() { None } else { Some(request) };
    }
    request.extend_from_slice(&buffer[..size]);
    if header_end.is_none() {
      header_end = find_header_end(&request);
    }
    if let Some(end) = header_end {
      let headers = String::from_utf8_lossy(&request[..end]);
      let content_length = header_content_length(&headers);
      if content_length > max_body {
        return None;
      }
      let body_start = end + 4;
      if request.len() >= body_start + content_length {
        request.truncate(body_start + content_length);
        return Some(request);
      }
    }
    if request.len() > max_body {
      return None;
    }
  }
}

fn find_header_end(bytes: &[u8]) -> Option<usize> {
  bytes.windows(4).position(|window| window == b"\r\n\r\n")
}

fn header_content_length(headers: &str) -> usize {
  headers
    .lines()
    .find_map(|line| {
      let (name, value) = line.split_once(':')?;
      if name.trim().eq_ignore_ascii_case("content-length") {
        value.trim().parse::<usize>().ok()
      } else {
        None
      }
    })
    .unwrap_or(0)
}

fn serve_static(stream: &mut TcpStream, raw_path: &str) {
  let root = dist_dir();
  let route = raw_path.split('?').next().unwrap_or("/");
  let route = percent_decode(route).trim_start_matches('/').to_string();
  let relative = if route.is_empty() { "index.html".to_string() } else { route };
  let mut target = root.join(relative);
  if target.is_dir() {
    target = target.join("index.html");
  }
  if !target.starts_with(&root) || !target.exists() {
    target = root.join("index.html");
  }
  match fs::read(&target) {
    Ok(body) => send_response(stream, 200, mime_type(&target), body),
    Err(_) => send_response(stream, 404, "text/plain; charset=utf-8", b"Not found".to_vec()),
  }
}

fn proxy_mmdvm(stream: &mut TcpStream, raw_path: &str) {
  let target = query_param(raw_path, "url").unwrap_or_default();
  if !(target.starts_with("http://") || target.starts_with("https://")) {
    send_response(stream, 400, "text/plain; charset=utf-8", b"Invalid target url".to_vec());
    return;
  }
  match ureq::get(&target)
    .set("accept", "application/json,text/html,*/*")
    .timeout(Duration::from_secs(4))
    .call()
  {
    Ok(response) => {
      let content_type = response
        .header("content-type")
        .unwrap_or("text/plain; charset=utf-8")
        .to_string();
      let mut reader = response.into_reader();
      let mut body = Vec::new();
      if reader.read_to_end(&mut body).is_ok() {
        send_response(stream, 200, &content_type, body);
      } else {
        send_response(stream, 502, "text/plain; charset=utf-8", b"Read failed".to_vec());
      }
    }
    Err(error) => send_response(
      stream,
      502,
      "text/plain; charset=utf-8",
      format!("局域网设备连接失败，请确认设备 IP、网络连接和系统本地网络权限。({error})").into_bytes(),
    ),
  }
}

fn proxy_brandmeister_device(stream: &mut TcpStream, raw_path: &str) {
  let id = query_param(raw_path, "id")
    .unwrap_or_default()
    .chars()
    .filter(|ch| ch.is_ascii_digit())
    .collect::<String>();
  if id.is_empty() {
    send_response(stream, 400, "application/json; charset=utf-8", br#"{"ok":false,"error":"missing id"}"#.to_vec());
    return;
  }
  let url = format!("https://api.brandmeister.network/v2/device/{id}");
  match ureq::get(&url).set("accept", "application/json").timeout(Duration::from_secs(8)).call() {
    Ok(response) => {
      let mut body = String::new();
      if response.into_reader().read_to_string(&mut body).is_ok() {
        let payload = format!(r#"{{"ok":true,"id":"{id}","device":{}}}"#, if body.trim().starts_with('{') { body } else { "null".to_string() });
        send_response(stream, 200, "application/json; charset=utf-8", payload.into_bytes());
      } else {
        send_response(stream, 200, "application/json; charset=utf-8", format!(r#"{{"ok":true,"id":"{id}","device":null}}"#).into_bytes());
      }
    }
    Err(_) => send_response(stream, 200, "application/json; charset=utf-8", format!(r#"{{"ok":true,"id":"{id}","device":null}}"#).into_bytes()),
  }
}

fn save_local_file(stream: &mut TcpStream, body: &[u8]) {
  let payload: serde_json::Value = match serde_json::from_slice(body) {
    Ok(payload) => payload,
    Err(_) => {
      send_response(stream, 400, "application/json; charset=utf-8", br#"{"ok":false,"error":"invalid json"}"#.to_vec());
      return;
    }
  };
  let filename = sanitize_filename(payload.get("filename").and_then(|value| value.as_str()).unwrap_or("HAM-checkin-export.dat"));
  let use_picker = payload.get("picker").and_then(|value| value.as_bool()).unwrap_or(true);
  let data = payload.get("dataBase64").and_then(|value| value.as_str()).unwrap_or_default();
  let bytes = match base64::engine::general_purpose::STANDARD.decode(data) {
    Ok(bytes) => bytes,
    Err(_) => {
      send_response(stream, 400, "application/json; charset=utf-8", br#"{"ok":false,"error":"invalid data"}"#.to_vec());
      return;
    }
  };
  let path = if use_picker {
    match rfd::FileDialog::new()
      .set_directory(downloads_dir())
      .set_file_name(&filename)
      .save_file()
    {
      Some(path) => path,
      None => {
        send_response(stream, 200, "application/json; charset=utf-8", br#"{"ok":false,"cancelled":true}"#.to_vec());
        return;
      }
    }
  } else {
    let output_dir = downloads_dir().join("HAM台网点名主控台");
    if fs::create_dir_all(&output_dir).is_err() {
      send_response(stream, 502, "application/json; charset=utf-8", br#"{"ok":false,"error":"cannot create output directory"}"#.to_vec());
      return;
    }
    output_dir.join(filename)
  };
  if fs::write(&path, bytes).is_err() {
    send_response(stream, 502, "application/json; charset=utf-8", br#"{"ok":false,"error":"cannot write file"}"#.to_vec());
    return;
  }
  let payload = serde_json::json!({
    "ok": true,
    "path": path.to_string_lossy()
  });
  send_response(stream, 200, "application/json; charset=utf-8", payload.to_string().into_bytes());
}

fn downloads_dir() -> PathBuf {
  std::env::var_os("HOME")
    .map(PathBuf::from)
    .unwrap_or_else(|| PathBuf::from("."))
    .join("Downloads")
}

fn sanitize_filename(value: &str) -> String {
  let cleaned = value
    .chars()
    .map(|ch| match ch {
      '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
      ch if ch.is_control() => '_',
      ch => ch,
    })
    .collect::<String>()
    .trim()
    .to_string();
  if cleaned.is_empty() {
    "HAM-checkin-export.dat".to_string()
  } else {
    cleaned
  }
}

fn send_response(stream: &mut TcpStream, status: u16, content_type: &str, body: Vec<u8>) {
  let reason = match status {
    200 => "OK",
    204 => "No Content",
    400 => "Bad Request",
    404 => "Not Found",
    405 => "Method Not Allowed",
    502 => "Bad Gateway",
    _ => "OK",
  };
  let headers = format!(
    "HTTP/1.1 {status} {reason}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\naccess-control-allow-origin: *\r\naccess-control-allow-methods: GET,POST,OPTIONS\r\naccess-control-allow-headers: content-type\r\nconnection: close\r\n\r\n",
    body.len()
  );
  let _ = stream.write_all(headers.as_bytes());
  if status != 204 {
    let _ = stream.write_all(&body);
  }
}

fn dist_dir() -> PathBuf {
  if let Ok(exe_path) = std::env::current_exe() {
    if let Some(contents_dir) = exe_path.parent().and_then(|path| path.parent()) {
      let bundled = contents_dir.join("Resources").join("dist");
      if bundled.exists() {
        return bundled;
      }
    }
  }

  PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("..")
    .join("dist")
    .canonicalize()
    .unwrap_or_else(|_| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("dist"))
}

fn mime_type(path: &Path) -> &'static str {
  match path.extension().and_then(|value| value.to_str()).unwrap_or_default() {
    "html" => "text/html; charset=utf-8",
    "js" => "application/javascript; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "svg" => "image/svg+xml",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "ico" => "image/x-icon",
    "wasm" => "application/wasm",
    "json" => "application/json; charset=utf-8",
    _ => "application/octet-stream",
  }
}

fn query_param(raw_path: &str, key: &str) -> Option<String> {
  let query = raw_path.split_once('?')?.1;
  for part in query.split('&') {
    let (name, value) = part.split_once('=').unwrap_or((part, ""));
    if name == key {
      return Some(percent_decode(value));
    }
  }
  None
}

fn percent_decode(value: &str) -> String {
  let mut bytes = Vec::with_capacity(value.len());
  let mut chars = value.as_bytes().iter().copied();
  while let Some(ch) = chars.next() {
    if ch == b'%' {
      let hi = chars.next().unwrap_or(b'0');
      let lo = chars.next().unwrap_or(b'0');
      if let (Some(hi), Some(lo)) = (hex_value(hi), hex_value(lo)) {
        bytes.push(hi * 16 + lo);
      }
    } else if ch == b'+' {
      bytes.push(b' ');
    } else {
      bytes.push(ch);
    }
  }
  String::from_utf8_lossy(&bytes).to_string()
}

fn hex_value(ch: u8) -> Option<u8> {
  match ch {
    b'0'..=b'9' => Some(ch - b'0'),
    b'a'..=b'f' => Some(ch - b'a' + 10),
    b'A'..=b'F' => Some(ch - b'A' + 10),
    _ => None,
  }
}
