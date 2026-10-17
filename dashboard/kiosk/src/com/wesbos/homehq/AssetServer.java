package com.wesbos.homehq;

import android.content.Context;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.Map;

/**
 * Minimal loopback-only HTTP server that serves the dashboard bundled in the
 * APK assets (dashboard/) so the WebView can load it over http://127.0.0.1
 * instead of file://, which modern Chromium CORS-blocks for subresources.
 * Binds 127.0.0.1 only: nothing on the network can reach it.
 */
public class AssetServer {
  private static final String TAG = "HomeHQ";
  private static final Map<String, String> TYPES = new HashMap<String, String>();
  static {
    TYPES.put("html", "text/html");
    TYPES.put("js", "application/javascript");
    TYPES.put("css", "text/css");
    TYPES.put("png", "image/png");
    TYPES.put("svg", "image/svg+xml");
    TYPES.put("json", "application/json");
    TYPES.put("webmanifest", "application/manifest+json");
    TYPES.put("ico", "image/x-icon");
  }

  private final Context context;
  private final int port;
  private ServerSocket server;

  public AssetServer(Context context, int port) {
    this.context = context;
    this.port = port;
  }

  public void start() throws IOException {
    server = new ServerSocket(port, 4, InetAddress.getByName("127.0.0.1"));
    Thread t = new Thread(new Runnable() {
      public void run() { loop(); }
    }, "AssetServer");
    t.setDaemon(true);
    t.start();
    Log.i(TAG, "AssetServer listening on 127.0.0.1:" + port);
  }

  private void loop() {
    while (true) {
      Socket s = null;
      try {
        s = server.accept();
        handle(s);
      } catch (IOException e) {
        Log.w(TAG, "AssetServer accept/handle failed: " + e);
        if (s != null) try { s.close(); } catch (IOException ignored) {}
      }
    }
  }

  private void handle(Socket s) throws IOException {
    try {
      InputStream in = s.getInputStream();
      StringBuilder head = new StringBuilder();
      int b;
      while (head.length() < 8192 && (b = in.read()) != -1) {
        head.append((char) b);
        int len = head.length();
        if (len >= 2 && head.charAt(len - 2) == '\r' && head.charAt(len - 1) == '\n') break;
      }
      String[] parts = head.toString().split(" ")[0].isEmpty()
          ? new String[0] : head.toString().split(" ");
      String path = parts.length > 1 ? parts[1] : "/";
      path = path.split("\\?")[0];
      if (path.equals("/")) path = "/index.html";
      if (path.contains("..")) { respond(s, 403, "text/plain", "forbidden".getBytes()); return; }

      String name = "dashboard" + path;
      InputStream a = context.getAssets().open(name);
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[8192];
      int n;
      while ((n = a.read(buf)) > 0) out.write(buf, 0, n);
      a.close();
      int dot = path.lastIndexOf('.');
      String ext = dot > 0 ? path.substring(dot + 1) : "";
      String type = TYPES.containsKey(ext) ? TYPES.get(ext) : "application/octet-stream";
      respond(s, 200, type, out.toByteArray());
    } catch (IOException e) {
      respond(s, 404, "text/plain", "not found".getBytes());
    } finally {
      try { s.close(); } catch (IOException ignored) {}
    }
  }

  private void respond(Socket s, int code, String type, byte[] body) throws IOException {
    OutputStream o = s.getOutputStream();
    String status = code == 200 ? "OK" : "Not Found";
    o.write(("HTTP/1.0 " + code + " " + status + "\r\n"
        + "Content-Type: " + type + "\r\n"
        + "Content-Length: " + body.length + "\r\n"
        + "Cache-Control: no-store\r\n\r\n").getBytes());
    o.write(body);
    o.flush();
  }
}
