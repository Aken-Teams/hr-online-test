# 智考云 - 原生 App 殼（防截屏）

將智考云網頁考試平台包裝成原生 App，實現**真正的截屏/錄屏防護**。

## 防護能力

| 平台 | 截屏 | 錄屏 | 螢幕分享 | 最近任務縮圖 |
|------|------|------|----------|-------------|
| **Android** | 黑屏 ✅ | 黑屏 ✅ | 黑屏 ✅ | 空白 ✅ |
| **iOS** | 偵測+警告 ⚠️ | 偵測+遮罩 ⚠️ | 偵測+遮罩 ⚠️ | 正常 ❌ |

> Android 使用 `FLAG_SECURE` 視窗旗標，這是銀行級的防護方案，截屏結果為全黑。
> iOS 無法完全阻止截屏，但能偵測並發出警告 + 在錄屏時覆蓋黑色遮罩。

## 專案結構

```
mobile/
├── src/
│   ├── App.tsx          # 主程式（WebView + 防截屏邏輯）
│   └── config.ts        # 網址與 App 設定
├── android/
│   └── app/src/main/java/com/zhikaocloud/exam/
│       ├── MainActivity.java       # FLAG_SECURE 初始化
│       ├── MainApplication.java    # React Native 入口
│       ├── ScreenGuardModule.java  # FLAG_SECURE 原生模組
│       └── ScreenGuardPackage.java # 模組註冊
├── ios/
│   └── ZhikaoExam/
│       ├── AppDelegate.mm          # iOS 入口
│       └── ScreenGuardModule.m     # 截屏偵測原生模組
├── package.json
└── README.md
```

## 環境需求

- Node.js >= 18
- React Native CLI (`npm install -g @react-native-community/cli`)
- **Android**: Android Studio + JDK 17 + Android SDK 35
- **iOS**: Xcode 15+ + CocoaPods（僅限 macOS）

## 快速開始

### 1. 安裝依賴

```bash
cd mobile
npm install

# iOS 額外步驟（僅 macOS）
cd ios && pod install && cd ..
```

### 2. 設定網址

編輯 `src/config.ts`：

```ts
export const CONFIG = {
  // 正式環境網址
  EXAM_URL: 'https://your-domain.com',
  // 開發環境網址
  DEV_URL: 'http://10.0.2.2:12059',
  // ...
};
```

### 3. 執行

```bash
# Android
npm run android

# iOS（僅 macOS）
npm run ios
```

## 建置發行版 APK

```bash
cd android
./gradlew assembleRelease
```

產出位置：`android/app/build/outputs/apk/release/app-release.apk`

> 正式發行前需要設定簽名金鑰，請參考 `android/app/build.gradle` 中的 `signingConfigs` 區塊。

## Web 端偵測 App 殼

App 會注入全域變數，網頁端可透過以下方式偵測：

```js
if (window.__ZHIKAO_NATIVE_APP__) {
  console.log('Running inside native app');
  console.log('Platform:', window.__ZHIKAO_PLATFORM__); // 'android' | 'ios'
}
```

User-Agent 也會包含 `ZhikaoExamApp/1.0` 標識。

## 運作原理

### Android — FLAG_SECURE

```java
getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
```

這是 Android 系統級的視窗安全旗標：
- 截屏 → 全黑畫面
- 錄屏 → 全黑畫面
- 螢幕分享/投射 → 全黑畫面
- 最近任務列表 → 空白縮圖

同樣的技術被用於：銀行 App、支付 App、Netflix 等。

### iOS — 截屏偵測

iOS 不提供 `FLAG_SECURE` 等效功能，因此採用偵測策略：
- `UIApplicationUserDidTakeScreenshotNotification` — 截屏後立即警告
- `UIScreen.isCaptured` — 偵測錄屏，覆蓋黑色遮罩直到停止錄製
