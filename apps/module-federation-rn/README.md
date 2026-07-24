# Stock React Native Module Federation demo

This native-only example runs a React Native CLI host and two independently
compiled Metro remotes. It uses React Native 0.86, Module Federation Metro 2.8,
and Uniwind without Expo.

The host owns the full Tailwind entry and global styles. Remote A and Remote B
emit explicitly prefixed Uniwind deltas and register their native styles under
the Module Federation container names `remoteA` and `remoteB`. Loading either
remote first must not replace the host or the other remote's styles.

## Run

Install dependencies from the repository root:

```sh
bun install
```

Run the iOS simulator:

```sh
bun run --cwd apps/module-federation-rn ios
```

Run an attached Android emulator or device:

```sh
bun run --cwd apps/module-federation-rn android
```

The Android launcher runs `adb reverse` for ports 8081-8083. For a device that
cannot use reverse port forwarding, set the host visible to the device:

```sh
MF_DEV_SERVER_HOST=192.168.1.20 bun run --cwd apps/module-federation-rn android
```

To start only the three Metro servers:

```sh
bun run --cwd apps/module-federation-rn start
```

Stop servers managed by the launcher:

```sh
bun run --cwd apps/module-federation-rn stop
```

| Project | Port |
| --- | --- |
| Host | 8081 |
| Remote A | 8082 |
| Remote B | 8083 |

## Verify

1. Confirm the three host signals resolve to `#16a34a`.
2. Load Remote A, then Remote B.
3. Confirm Remote A remains `#facc15`, Remote B remains `#2563eb`, and the host remains `#16a34a`.
4. Reload the runtime and repeat in the opposite order.

The demo uses only the stock React Native CLI and `@react-native/metro-config`.
Module Federation's own package currently has a transitive dependency on
`@expo/metro-runtime` for its async bundle loader; the app itself does not
depend on Expo or use Expo configuration, entrypoints, CLI, or native modules.

`metro.shared.js` also materializes Module Federation's standard registry
proxies for remote shared dependencies. This is local compatibility scaffolding
for a Module Federation Metro 2.8 resolver path that does not register those
virtual modules when `import: false`; it is not an Uniwind workaround.

Imports originating from Module Federation's generated `.mf-metro` runtime are
delegated directly to its resolver. This keeps the host's eager `react-native`
share bound to the stock package while application imports continue through
Uniwind's component resolver.
