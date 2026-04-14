package com.zhikaocloud.exam;

import android.app.Activity;
import android.view.WindowManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.UiThreadUtil;

/**
 * Native module that sets/clears FLAG_SECURE on the current Activity window.
 *
 * When FLAG_SECURE is set:
 * - Screenshots appear completely black
 * - Screen recordings capture a black screen
 * - Recent-apps thumbnail is blank
 * - Screen sharing / casting shows black
 *
 * This is the same technique used by banking and payment apps.
 */
public class ScreenGuardModule extends ReactContextBaseJavaModule {

    public ScreenGuardModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "ScreenGuard";
    }

    @ReactMethod
    public void enable() {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }

    @ReactMethod
    public void disable() {
        UiThreadUtil.runOnUiThread(() -> {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            }
        });
    }
}
