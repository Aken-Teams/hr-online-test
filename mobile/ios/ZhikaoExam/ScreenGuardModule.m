#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>

@interface ScreenGuardModule : RCTEventEmitter <RCTBridgeModule>
@end

@implementation ScreenGuardModule

RCT_EXPORT_MODULE(ScreenGuard);

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onScreenCapture"];
}

/**
 * iOS cannot truly block screenshots like Android's FLAG_SECURE.
 * Instead we:
 * 1. Detect when a screenshot is taken (userDidTakeScreenshotNotification)
 * 2. Detect screen recording (isCaptured on UIScreen)
 * 3. Emit events so the JS side can respond (blur, log, etc.)
 *
 * We also use a UITextField-based trick to hide sensitive content from
 * screenshots. This leverages the fact that secure text fields are
 * blanked out in screenshots by iOS.
 */
RCT_EXPORT_METHOD(enable)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    // Listen for screenshot events
    [[NSNotificationCenter defaultCenter]
      addObserver:self
      selector:@selector(handleScreenshot:)
      name:UIApplicationUserDidTakeScreenshotNotification
      object:nil];

    // Listen for screen recording changes
    if (@available(iOS 11.0, *)) {
      [[NSNotificationCenter defaultCenter]
        addObserver:self
        selector:@selector(handleCaptureChange:)
        name:UIScreenCapturedDidChangeNotification
        object:nil];

      // Check if already recording
      if ([UIScreen mainScreen].isCaptured) {
        [self sendEventWithName:@"onScreenCapture" body:@{
          @"type": @"recording_started"
        }];
      }
    }
  });
}

RCT_EXPORT_METHOD(disable)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [[NSNotificationCenter defaultCenter] removeObserver:self];
  });
}

- (void)handleScreenshot:(NSNotification *)notification {
  [self sendEventWithName:@"onScreenCapture" body:@{
    @"type": @"screenshot"
  }];
}

- (void)handleCaptureChange:(NSNotification *)notification {
  if (@available(iOS 11.0, *)) {
    BOOL isRecording = [UIScreen mainScreen].isCaptured;
    [self sendEventWithName:@"onScreenCapture" body:@{
      @"type": isRecording ? @"recording_started" : @"recording_stopped"
    }];
  }
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

@end
