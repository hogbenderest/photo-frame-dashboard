package com.wesbos.homehq;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.SslError;
import android.webkit.SslErrorHandler;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Full-screen kiosk WebView for the Home HQ wall tablet.
 * - Immersive mode hides the status + navigation bars (true 1280x800).
 * - Exit: hold two fingers still on the screen for 1.5s to go to the regular launcher.
 * - Remote debugging is OFF unless launched with the debug extra (every app on this device
 *   gets root, so the devtools socket should only exist while actively debugging):
 *     adb shell am start -n com.wesbos.homehq/.MainActivity --ez debug true
 * - Launch with a URL: adb shell am start -a android.intent.action.VIEW -d <url> -n com.wesbos.homehq/.MainActivity
 */
public class MainActivity extends Activity {
  static final String TAG = "HomeHQ";
  static final String DEFAULT_URL = "http://127.0.0.1:8123/index.html";
  static final long EXIT_HOLD_MS = 1500;
  static final float EXIT_SLOP_PX = 60;

  private WebView web;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final int[] exitIds = new int[2];
  private final float[] exitX = new float[2];
  private final float[] exitY = new float[2];
  private boolean exitArmed;

  private final Runnable exitToLauncher = new Runnable() {
    @Override
    public void run() {
      exitArmed = false;
      Log.i(TAG, "Two-finger hold: exiting to launcher");
      Intent home = new Intent(Intent.ACTION_MAIN);
      home.addCategory(Intent.CATEGORY_HOME);
      home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      startActivity(home);
      finish();
    }
  };

  @Override
  protected void onCreate(Bundle state) {
    super.onCreate(state);
    applyDebugFlag(getIntent());
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        | WindowManager.LayoutParams.FLAG_FULLSCREEN);

    web = new WebView(this);
    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setUseWideViewPort(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    // WebView 74+ blocks the file:// scheme by default; the local mode
    // (file:///sdcard/dashboard/index.html) needs this explicit opt-in.
    s.setAllowFileAccess(true);
    web.setWebViewClient(new WebViewClient() { // keep navigation inside the kiosk
      // Android 6.0's 2016-era trust store predates the roots most modern sites chain to
      // (Let's Encrypt, GTS), and this device's su has no CAP_SYS_ADMIN/DAC_OVERRIDE so the
      // system CA store cannot be extended and the vendor's CertInstaller is hollow. For a
      // single-purpose kiosk on an untrusted-device budget (see docs/fangor-114k.md), accept
      // SSL_UNTRUSTED chains for any host; expired / mismatched / otherwise-invalid
      // certificates still hard-fail.
      // No @Override: the SDK stub's WebViewClient cannot declare this method because it
      // references the hidden android.webkit.SslError; the runtime framework class has it
      // and dispatch lands here normally.
      public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        if (error.getPrimaryError() == SslError.SSL_UNTRUSTED) {
          handler.proceed();
        } else {
          handler.cancel();
        }
      }
    });
    setContentView(web);

    try {
      new AssetServer(this, 8123).start();
    } catch (Exception e) {
      Log.w(TAG, "AssetServer failed to start: " + e);
    }

    if (getIntent().getBooleanExtra("seedca", false)) seedCertsFromAssets();

    String url = getIntent().getDataString();
    web.loadUrl(url != null ? url : DEFAULT_URL);
  }

  /**
   * One-time helper (launch with --ez seedca true): feed the bundled Let's Encrypt roots
   * through the system certificate installer so Android 6's default trust picks them up
   * from the user store. The frame's vendor CertInstaller file picker is non-functional,
   * so this is the supported path to getting the roots installed.
   */
  private void seedCertsFromAssets() {
    String[] names = {"isrg-root-x1.pem", "isrg-root-x2.pem"};
    for (String name : names) {
      try {
        InputStream in = getAssets().open(name);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        X509Certificate cert = (X509Certificate) CertificateFactory.getInstance("X.509")
            .generateCertificate(new ByteArrayInputStream(out.toByteArray()));
        Intent install = new Intent("android.credentials.INSTALL");
        install.putExtra("CERTIFICATE", cert.getEncoded()); // KeyChain.EXTRA_CERTIFICATE
        install.putExtra("name", "ISRG " + (name.contains("x2") ? "X2" : "X1"));
        startActivity(install);
        Log.i(TAG, "seeded install intent for " + name);
        Thread.sleep(500); // let the two dialogs stack in order
      } catch (Exception e) {
        Log.w(TAG, "seed " + name + " failed: " + e);
      }
    }
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    applyDebugFlag(intent);
    String url = intent.getDataString();
    if (url != null) web.loadUrl(url);
  }

  /** Remote debugging only when explicitly requested; any normal launch turns it back off. */
  private void applyDebugFlag(Intent intent) {
    boolean debug = intent != null && intent.getBooleanExtra("debug", false);
    WebView.setWebContentsDebuggingEnabled(debug);
    Log.i(TAG, "WebView remote debugging " + (debug ? "ON" : "off"));
  }

  /** Watches for the two-finger exit hold; all touches still go to the page. */
  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_POINTER_DOWN:
        if (e.getPointerCount() == 2) {
          for (int i = 0; i < 2; i++) {
            exitIds[i] = e.getPointerId(i);
            exitX[i] = e.getX(i);
            exitY[i] = e.getY(i);
          }
          exitArmed = true;
          handler.removeCallbacks(exitToLauncher);
          handler.postDelayed(exitToLauncher, EXIT_HOLD_MS);
        } else {
          cancelExit(); // 3+ fingers
        }
        break;
      case MotionEvent.ACTION_MOVE:
        if (exitArmed) {
          for (int i = 0; i < 2; i++) {
            int idx = e.findPointerIndex(exitIds[i]);
            if (idx < 0 || Math.hypot(e.getX(idx) - exitX[i], e.getY(idx) - exitY[i]) > EXIT_SLOP_PX) {
              cancelExit();
              break;
            }
          }
        }
        break;
      case MotionEvent.ACTION_POINTER_UP:
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL:
        cancelExit();
        break;
      default:
        break;
    }
    return super.dispatchTouchEvent(e);
  }

  private void cancelExit() {
    if (!exitArmed) return;
    exitArmed = false;
    handler.removeCallbacks(exitToLauncher);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemUi();
  }

  private void hideSystemUi() {
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
  }
}
