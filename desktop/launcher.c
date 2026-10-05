// The macOS bundle's entry point (D160, on the D155 desktop app): turns on WebKit's iframe-embedding patch and
// starts the real Neutralino binary. It inserts libjeanframe.dylib (which lets a framed site that
// sends X-Frame-Options or a CSP frame-ancestors show in the browser pane, D140), points Neutralino
// at Contents/Resources for resources.neu and the config (so Contents/MacOS holds only code, which
// code signing requires), and forces bundle mode. The real binary is ad-hoc signed and not
// hardened, so dyld honours the inserted library.
#include <mach-o/dyld.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char *argv[]) {
  char self[PATH_MAX];
  uint32_t size = sizeof(self);
  if (_NSGetExecutablePath(self, &size) != 0) return 127;
  char dir[PATH_MAX];
  strncpy(dir, self, sizeof(dir) - 1);
  dir[sizeof(dir) - 1] = '\0';
  char *slash = strrchr(dir, '/');
  if (!slash) return 127;
  *slash = '\0';

  char dylib[PATH_MAX], resources[PATH_MAX], binary[PATH_MAX], pathArg[PATH_MAX];
  snprintf(dylib, sizeof(dylib), "%s/../Frameworks/libjeanframe.dylib", dir);
  setenv("DYLD_INSERT_LIBRARIES", dylib, 1);
  snprintf(resources, sizeof(resources), "%s/../Resources", dir);
  snprintf(pathArg, sizeof(pathArg), "--path=%s", resources);
  snprintf(binary, sizeof(binary), "%s/jean-bin", dir);

  char *args[argc + 3];
  args[0] = binary;
  args[1] = pathArg;
  args[2] = (char *)"--res-mode=bundle";
  for (int i = 1; i < argc; i++) args[i + 2] = argv[i];
  args[argc + 2] = NULL;
  execv(binary, args);
  return 127;
}
