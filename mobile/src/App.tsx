import React, { useRef, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Platform,
  NativeModules,
  NativeEventEmitter,
  BackHandler,
  ActivityIndicator,
  Alert,
  View,
  Text,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { CONFIG } from './config';

const { ScreenGuard } = NativeModules;

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [screenBlocked, setScreenBlocked] = useState(false);

  const examUrl = __DEV__ ? CONFIG.DEV_URL : CONFIG.EXAM_URL;

  // ── Android FLAG_SECURE + iOS screenshot detection ───────
  useEffect(() => {
    if (ScreenGuard?.enable) {
      ScreenGuard.enable();
    }

    // iOS: listen for screenshot / screen recording events
    if (Platform.OS === 'ios' && ScreenGuard) {
      const emitter = new NativeEventEmitter(ScreenGuard);
      const subscription = emitter.addListener('onScreenCapture', (event) => {
        if (event.type === 'screenshot') {
          Alert.alert('截屏警告', '系統偵測到截屏操作，此行為已被記錄。');
        } else if (event.type === 'recording_started') {
          setScreenBlocked(true);
        } else if (event.type === 'recording_stopped') {
          setScreenBlocked(false);
        }
      });
      return () => {
        subscription.remove();
        ScreenGuard?.disable?.();
      };
    }

    return () => {
      ScreenGuard?.disable?.();
    };
  }, []);

  // ── Hardware back button → WebView back ──────────────────
  useEffect(() => {
    const handler = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true; // consumed
      }
      return false; // let system handle (exit app)
    };
    BackHandler.addEventListener('hardwareBackPress', handler);
    return () => BackHandler.removeEventListener('hardwareBackPress', handler);
  }, [canGoBack]);

  const onNavigationStateChange = (nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack);
  };

  if (error) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>無法連線</Text>
        <Text style={styles.errorMsg}>請檢查網路連線後重新開啟 App</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <WebView
        ref={webViewRef}
        source={{ uri: examUrl }}
        style={styles.webview}
        userAgent={`${CONFIG.USER_AGENT_SUFFIX}`}
        onNavigationStateChange={onNavigationStateChange}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => setError(true)}
        onHttpError={(e) => {
          if (e.nativeEvent.statusCode >= 500) setError(true);
        }}
        // Security settings
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mediaPlaybackRequiresUserAction
        // Prevent opening external browser
        setSupportMultipleWindows={false}
        // Inject a flag so the web app knows it's in the native shell
        injectedJavaScript={`
          window.__ZHIKAO_NATIVE_APP__ = true;
          window.__ZHIKAO_PLATFORM__ = '${Platform.OS}';
          true;
        `}
      />

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0d9488" />
          <Text style={styles.loadingText}>載入中...</Text>
        </View>
      )}

      {/* iOS: block view when screen recording is detected */}
      {screenBlocked && (
        <View style={styles.blockedOverlay}>
          <Text style={styles.blockedIcon}>🔒</Text>
          <Text style={styles.blockedTitle}>錄屏已偵測</Text>
          <Text style={styles.blockedMsg}>
            請關閉螢幕錄製功能後繼續考試
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  center: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  errorMsg: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  blockedIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  blockedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  blockedMsg: {
    fontSize: 15,
    color: '#ccc',
    textAlign: 'center',
  },
});
