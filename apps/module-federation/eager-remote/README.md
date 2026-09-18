# Eager React Native and Uniwind shares

This fixture reproduces an eager Module Federation initialization cycle between React Native Web and Uniwind. The failure happens while the host evaluates `mf:init-host`, before any remote component renders.

## Versions

- `@module-federation/metro`: `2.9.0`
- `@module-federation/runtime`: `2.9.0`
- Expo: `57.0.26`
- Metro: `0.84.5`
- React: `19.2.3`
- React Native: `0.86.3`
- React Native Web: `0.21.3`
- Uniwind: `1.12.2-mf.0`

The host eagerly shares:

- `react`
- `react-native`
- `uniwind`
- `uniwind/components`
- `uniwind/components/FlatList`

The remote declares the same modules as singleton shares with `import: false`, so it must consume the host's copies.

## Failure

Before the dependency patch, opening the host produces one or both of:

```text
Module uniwind/components/FlatList not found in registry
Module react-native not found in registry
```

The cycle is:

```text
Module Federation initializes react-native
→ react-native-web index loads
→ Uniwind redirects FlatList
→ Uniwind FlatList imports react-native
→ Module Federation reads react-native before initialization finishes
```

The useful isolation controls are:

1. Uniwind without Module Federation passes.
2. Module Federation without sharing `react-native` passes.
3. Module Federation sharing `react-native`, without Uniwind, passes.
4. The complete configuration fails without the registry patch.

Uniwind remains the outer Metro wrapper. The fixtures do not add resolver exceptions and do not import `uniwind/components/FlatList` directly.

## Fix

The checked-in patch at `../../../patches/@module-federation%2Fmetro@2.9.0.patch` changes the Module Federation registry to:

- reserve eager shares before React Native Web can request them;
- synchronously initialize a reserved share on first access;
- clone real exports into the reserved object so circular references keep the same identity;
- preserve CommonJS default-import behavior while a reserved module is populated.

Uniwind's Metro resolver also preserves upstream virtual and provider-origin resolutions. It only re-pins a request when Metro resolves it to a different installed Uniwind package.

## Tests

From `apps/module-federation`:

```sh
bun run test:host-startup
bun run test:remote-startup
```

`test:host-startup` is intentionally remote-free. It isolates the eager initialization failure and verifies that the host root and `FlatList` render without page errors.

`test:remote-startup` starts `eager-remote-host` on port `8081` and this remote on port `8082`. The host first renders independently, then loads the remote and verifies that its `FlatList` renders from the host-provided shares.

Expo 57's development remote HMR path imports a native-only module on web. The remote integration requests the container in production mode and installs a federation-aware split loader as a runtime plugin. That plumbing is separate from the eager-share fix and is deliberately absent from the host-only test.
