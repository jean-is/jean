// Monkey-patch for the desktop app's macOS web view (WebKit): turn on WebKit's internal
// IgnoreIframeEmbeddingProtectionsEnabled feature so a framed site that sends X-Frame-Options or
// a CSP frame-ancestors can still show in Jean's browser pane. Injected into the Neutralino binary (D160);
// a constructor swizzles the one choke point every WKWebView passes through, and sets the feature on
// that web view's own configuration, exactly as the tested WKPreferences call does.
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#import <CoreGraphics/CoreGraphics.h>

static void enableOnPreferences(id preferences) {
  if (!preferences) return;
  Class prefsClass = objc_getClass("WKPreferences");
  SEL featuresSel = sel_registerName("_features");
  if (!prefsClass || ![prefsClass respondsToSelector:featuresSel]) return;
  id features = ((id (*)(id, SEL))objc_msgSend)((id)prefsClass, featuresSel);
  SEL setEnabled = sel_registerName("_setEnabled:forFeature:");
  if (![preferences respondsToSelector:setEnabled]) return;
  for (id feature in features) {
    NSString *key = ((id (*)(id, SEL))objc_msgSend)(feature, sel_registerName("key"));
    if ([key isEqualToString:@"IgnoreIframeEmbeddingProtectionsEnabled"]) {
      ((void (*)(id, SEL, BOOL, id))objc_msgSend)(preferences, setEnabled, YES, feature);
      return;
    }
  }
}

static id (*orig_initWithFrameConfig)(id, SEL, CGRect, id) = NULL;
static id patched_initWithFrameConfig(id self, SEL _cmd, CGRect frame, id config) {
  @try {
    if (config) enableOnPreferences(((id (*)(id, SEL))objc_msgSend)(config, sel_registerName("preferences")));
  } @catch (__unused NSException *ignored) {}
  return orig_initWithFrameConfig(self, _cmd, frame, config);
}

__attribute__((constructor))
static void jeanframe_install(void) {
  Class webView = objc_getClass("WKWebView");
  if (!webView) return;
  Method method = class_getInstanceMethod(webView, sel_registerName("initWithFrame:configuration:"));
  if (!method) return;
  orig_initWithFrameConfig = (id (*)(id, SEL, CGRect, id))method_getImplementation(method);
  method_setImplementation(method, (IMP)patched_initWithFrameConfig);
}
