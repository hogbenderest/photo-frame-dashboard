package android.webkit;

/**
 * Compile-time stub for the hidden android.webkit.SslError API (absent from all
 * public SDK platform jars, including android-23 and android-34).
 *
 * Compiled into build/stub-classes and used ONLY as a javac classpath input;
 * deliberately NOT dexed into the APK (build.sh dexes build/classes only).
 * At runtime the framework's own hidden class satisfies all references.
 *
 * Constant values verified against AOSP android-6.0 core/java/android/webkit/SslError.java:
 * SSL_EXPIRED=1, SSL_IDMISMATCH=2, SSL_UNTRUSTED=3, SSL_DATE_INVALID=4, SSL_INVALID=5.
 */
public class SslError {
  public static final int SSL_EXPIRED = 1;
  public static final int SSL_IDMISMATCH = 2;
  public static final int SSL_UNTRUSTED = 3;
  public static final int SSL_DATE_INVALID = 4;
  public static final int SSL_INVALID = 5;

  public int getPrimaryError() { throw new RuntimeException("compile-time stub"); }
  public String getUrl() { throw new RuntimeException("compile-time stub"); }
}
