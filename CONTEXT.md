# Uniwind Context

This document captures working context for `packages/uniwind`, the published `uniwind` package in this monorepo. Keep it current when architecture, public APIs, supported platforms, or build/runtime contracts change.

## Product

Uniwind is Tailwind CSS bindings for React Native and React Native Web. It lets users write `className` props on React Native components while doing as much style work as possible at build time.

Primary promise: fast Tailwind styling for React Native with web parity where practical.

Positioning: Uniwind optimizes for build-time Tailwind-to-React-Native artifacts, minimal runtime work, and React Native Web parity. It is not primarily a full design-system/runtime styling framework, a NativeWind compatibility layer, or a web-first CSS bridge.

Core user-facing features:

- Out-of-the-box `className` bindings for React Native components.
- Tailwind v4 CSS compilation into native runtime style artifacts or web CSS.
- Light, dark, and extra named themes.
- `active`, `focus`, `disabled`, RTL, orientation, responsive, data attribute, and platform-aware variants.
- CSS custom property reads and updates from React Native code.
- Scoped themes through `ScopedTheme`.
- Scoped layout direction through `LayoutDirection`.
- Scoped CSS variables through `ScopedVariables`.
- Metro and Vite integration.

Supported platforms: iOS, Android, web, Android TV, and Apple TV. Other React Native targets are out of scope until tests and docs explicitly cover them.

## Package Boundaries

Important paths:

- `packages/uniwind/src/index.ts`: public package entrypoint.
- `packages/uniwind/src/components`: React Native component wrappers and web exports.
- `packages/uniwind/src/core`: runtime config, listeners, native style store, and web style extraction.
- `packages/uniwind/src/hooks`: public hooks.
- `packages/uniwind/src/hoc`: `withUniwind` for custom components.
- `packages/uniwind/src/bundler`: Metro/Vite adapters, Tailwind compilation, CSS processing, artifact generation.
- `packages/uniwind/tests`: native, web, type, and e2e tests.
- `packages/uniwind/uniwind.css`: package-level CSS artifact referenced by package `style` export. It carries the custom variants, safe-area utilities, and the generated theme variables, plus the web-only `uniwind-default-font` base rule for configs that set `defaultFontFamily`; `src/bundler/artifacts/css` builds it. The committed copy is the default-config artifact of `@import "tailwindcss"; @import "uniwind";`, so it has no such rule.
- `packages/uniwind/no-types.d.ts`: published placeholder declaration for component subpath exports.

Public exports from `src/index.ts`:

- `Uniwind` runtime/config object.
- `LayoutDirection` component.
- `ScopedTheme` component.
- `ScopedVariables` component.
- `withUniwind` HOC and related types.
- `useCSSVariable`, `useResolveClassNames`, `useUniwind` hooks.
- `ThemeName` and `UniwindConfig` types.

Package subpath exports:

- `uniwind`: main runtime API. `package.json` also sets top-level `react-native` (`./src/index.ts`) and `main` (`./dist/common/index.js`), mirroring `exports["."]`, so Metro can still resolve the root entry when it skips `exports` (file-map miss, installer stub, older resolvers). Keep both: without `main` Metro defaults to a non-existent `index`.
- `uniwind/components`: React Native component replacements.
- `uniwind/components/*`: individual component replacements.
- `uniwind/metro`: Metro adapter.
- `uniwind/vite`: Vite plugin.
- `uniwind/types`: generated/user-facing type support.

Stability policy: public package and subpath exports are semver-stable. Generated artifact internals are implementation details unless explicitly documented, with two notable user-facing surfaces: generated theme typings and the package `style` export (`uniwind.css`).

Dependency policy: peer dependency floors are support contracts. Raising support floors for Tailwind, React, or React Native requires semver-major unless an upstream ecosystem break makes that impossible to honor.

Workspace dependency alignment: the examples share Expo SDK 57's React Native 0.86 and React 19.2 release lines; React Native presets/configs and React's test renderer must stay aligned with those lines. Expo's compatibility check requires React/React DOM 19.2.3 and React 19.2 types. Development uses Node.js 22.13+ (or a supported newer LTS), including Vitest 5. TypeScript stays on 6 until the declaration-build tooling supports TypeScript 7's compiler API changes, and native Testing Library stays on 13 until the tests migrate to the async APIs in 14. Babel stays on 7 while the React Native and Expo presets depend on Babel 7 plugins. Lightning CSS remains pinned to 1.30.1; its existing transitive copies stay locked to 1.32.0, constraining Vite to 8.1.5 until that pin is lifted.

## Runtime Model

Native runtime:

- Build output injects a generated stylesheet callback into `Uniwind.__reinit(...)`, along with the runtime options the build config sets (`defaultFontFamily`).
- Federated remote build output registers an owner-keyed style delta instead.
- `UniwindStore` holds generated style records, theme variables, scoped variables, runtime state, and per-theme caches.
- `UniwindStore.getStyles(className, props, state, context)` resolves classes into React Native style objects.
- Cache keys include class names, component state, whether theme is scoped, layout direction, and a key derived from the merged `ScopedVariables` map.
- During resolve, `ScopedVariables` overrides are overlaid onto a prototype-chained clone of the theme vars so unset variables fall through to the theme.
- Resolved styles subscribe to only dependencies they use, then invalidate cache entries on change.
- Runtime dependencies are represented by `StyleDependency`: theme, dimensions, orientation, insets, font scale, RTL, adaptive themes, and variables.
- Native style resolution filters rules by screen width, orientation, theme, RTL, active/focus/disabled state, and `data-*` props.
- Native post-processing adapts CSS concepts to RN shapes, including line-height multipliers, shadows, transforms, gradients, visibility, borders, outlines, font variants, and filters.

Web runtime:

- Web keeps styles in CSS and passes `{ $$css: true, tailwind: className }` through RNW style arrays.
- `getWebStyles` uses a hidden DOM element to compute style values when a JS value is needed, such as color extraction or `useResolveClassNames`.
- `CSSListener` tracks active CSS rules and media queries, then notifies subscribers when stylesheets load or unload or class-dependent media rules change. After a scan that discovers new stylesheets or prunes removed ones, it emits one variables notification so JS-resolved styles refresh when CSS arrives after module initialization, including Metro web development startup. Deferred scans safely return if `document` has been removed before they run, such as during test environment teardown.
- `ScopedTheme` renders a `div` with the theme class and `display: contents` on web.
- `LayoutDirection` renders a contents-style wrapper with `direction`/`dir` semantics so RTL/LTR variants can be scoped to a subtree.
- `ScopedVariables` renders a `display: contents` wrapper and sets its variables as inline custom properties on that wrapper, so the real DOM cascade resolves `var(--name)` to the scoped value for every descendant (numbers become px). During JS reads (`getWebVariable` / `useResolveClassNames`) it also applies the variables to the hidden `dummyParent`, then clears them.
- Dynamic CSS variable updates are written into a generated `#uniwind-dynamic-styles` style element.

Shared runtime:

- `Uniwind.setTheme(theme | 'system')` switches explicit themes or returns to system-adaptive light/dark.
- `Uniwind.currentTheme` and `Uniwind.hasAdaptiveThemes` back `useUniwind`.
- `Uniwind.updateCSSVariables(theme, variables)` updates theme variables and notifies variable subscribers.
- `Uniwind.updateInsets(insets)` is native-only behavior and updates safe-area-style runtime values.
- `ScopedTheme` sets `UniwindContext.scopedTheme`; scoped subtree ignores global theme changes for style resolution.
- `LayoutDirection` sets `UniwindContext.rtl`; scoped subtree uses that direction for RTL/LTR variant resolution instead of global runtime RTL.
- `ScopedVariables` sets `UniwindContext.variables`; the subtree overrides CSS variables for style resolution and `useCSSVariable` without mutating the global theme. Nested providers merge with ancestors, nearest wins.
- Runtime options (`defaultFontFamily`) come from the build config through the host's generated registration: the native host stylesheet and, on web, `metro-injected.js` or the config module the Vite plugin extends pass them to `Uniwind.__reinit`. A registration without options, such as a federated remote's, leaves them unchanged.

## Build And Bundler Model

Configuration shape:

- `cssEntryFile`: required CSS entry path, resolved from `process.cwd()`.
- `extraThemes`: optional named themes added to default `light` and `dark`.
- `dtsFile`: optional generated declaration file path, default `uniwind-types.d.ts`.
- `defaultFontFamily`: optional boolean, default `false`, for Metro (native and web), Vite, and the CLI's `--default-font-family`. When on, root `Text` and `TextInput` start from the theme's `--default-font-family` (see Components); where a theme or platform variant leaves that token unset or sets a CSS-wide keyword such as `initial`, and on native also where it is a fallback list, they keep the platform default (React Native Web's System font on web). When off, Uniwind adds no default font rule to its artifact, so it causes no `--default-font-family` emission, `Text`/`TextInput` subscribe to nothing for it and render as they did before the option existed, and `experimental.optimizeClasslessComponents: true` compiles their classless usages raw like any other component. Anything but a boolean fails config creation. A federated remote should set its host's value: the host's registration decides runtime behavior, and the remote's value only shapes its own build (artifact, classless `Text`/`TextInput`). That registration reaches remote text only when the remote takes Uniwind's components from the host, by sharing `uniwind/components` and the `uniwind/components/*` subpaths the resolver requests, as `apps/module-federation/eager-remote` does. A remote that bundles its own copy of them, as the local Module Federation demo's remotes do (they share only the `uniwind` root), renders root `Text` and `TextInput` through a copy that no registration gives options to, so they render as with the option off whatever either config sets.
- Metro-only `experimental.federation`: optional experimental host/remote build contract. Hosts may declare exact shared class candidates that are force-generated into the base build and may list inlined remote stylesheets with an owner ID, CSS entry file, and optional shared candidates. Remotes use a stable owner ID and exclude exact shared candidates from their scanned delta. See the [local Module Federation demo](apps/module-federation/README.md).
- Metro-only `experimental.optimizeClasslessComponents`: `boolean | ClasslessComponentPredicate`, default `false`, a native compile-time optimization for statically classless built-in React Native elements. The Metro adapter's `constants.ts` keeps the component scope as separately adjustable lists: `NATIVE_COMPONENT_NAMES` is every wrapped component and doubles as the resolver's wrapper set, so it must stay complete; `CLASSLESS_COMPONENT_EXCLUSIONS` (the deprecated `SafeAreaView`) names components that must keep their wrapper and removes them from the eligible set `CLASSLESS_COMPONENT_NAMES` and from the `ClasslessComponentName` type, so no predicate can enable them; `NON_DEFAULT_CLASSLESS_COMPONENT_NAMES` (empty) names eligible components that `true` does not enable, and `DEFAULT_FONT_COMPONENT_NAMES` (`Text`, `TextInput`) names those it does not enable while `defaultFontFamily` is on. `getDefaultClasslessComponentNames` derives the default set from both for a resolved config. `true` enables the default set. A predicate is asked synchronously once per eligible component, receives the component name plus `{ isDefault }` (whether `true` would enable it under this config), and must return a boolean, so `(component, { isDefault }) => isDefault && component !== 'Modal'` is the default set minus `Modal` and `(component, { isDefault }) => isDefault || component === 'Text'` adds `Text`, which is non-default while `defaultFontFamily` is on. A predicate may enable `Text` and `TextInput` while `defaultFontFamily` is on; their classless usages then compile to the raw components, React Native's own exports, which don't apply the default font. `ClasslessComponentName` and `ClasslessComponentPredicate` are exported from `uniwind/metro`; a fixed list must be typed as `ClasslessComponentName[]` for `component => list.includes(component)` to type-check. Any other option value (`null`, a string, an array) fails config creation; the error for an array suggests that predicate.
- Metro-only `polyfills.rem`: custom rem base, default `16`.
- Metro-only `debug` and `isTV` flags exist in types.

Compilation flow:

- `compileTailwind` reads `cssEntryFile`, runs Tailwind v4 compile, scans files under the CSS entry directory, and builds final CSS.
- `compileCSS` routes to web or native by platform.
- `compileWebCSS` runs Lightning CSS with `UniwindCSSVisitor` and returns CSS.
- `compileNativeCSS` runs `ProcessorBuilder`, serializes variables, scoped variables, and native stylesheet metadata into JS source.
- `UniwindBundlerConfig.generateArtifacts` writes CSS artifacts and generated theme typings.
- Theme artifact generation discovers imported stylesheets with a discovery-only Tailwind compile of the CSS entry, so `prefix(...)` and other import modifiers resolve as in the real build. That compile also validates the entry, while its `@import "uniwind"` resolves, as in the real build, to the artifact the build regenerates (under Metro the project's own, see Metro integration) or, before that exists, to the package's `uniwind.css` (the fresh-install artifact, or another project's copy), which may lack this build's theme variants (`@variant <theme>`) and theme variables (`@apply`, `--theme()`). So discovery compiles a stylesheet that imports the entry between the theme declarations being generated: every configured theme's variant before it, so that the entry's own `@custom-variant` definitions still override them as in the real build, and the theme variables found so far after it. Importing the entry rather than inlining its text keeps a last statement that runs to EOF, without a semicolon or inside an unclosed comment, from absorbing the declarations. Tailwind resolves every `@import` before it validates anything, so when the compile fails after reaching stylesheets that declare theme variables, discovery retries once with them. Any error that remains, including an `@import` that Tailwind's default resolver can't resolve (it doesn't know bundler aliases such as Vite's `resolve.alias`), fails artifact generation instead of writing an incomplete theme block. A retry that fails too first logs the variables each theme is missing, as the build always has: the retry declares the first theme's variables, so applying one that only another theme declares fails it. Tailwind also reports the modules `@plugin` and `@config` load and every file their import and require strings appear to name, whatever its type. It resolves every `@import` before it loads any module, so only the dependencies reported before the first module resolution are scanned as stylesheets. The entry is scanned first and the other stylesheets in path order, because Tailwind reports nested imports in the order their parents finish loading, which varies between runs and would change the artifact's bytes. Lightning CSS scans each stylesheet with its `@import` statements removed, so an import after a rule doesn't fail the scan. An `@import` ends at its semicolon or, as the last statement, at EOF, and comments and strings are skipped whole, so an `@import` inside one stays; the pattern matches each text one way only, so scanning stays linear.
- Generated artifacts are rewritten in place and Metro regenerates them from a worker pool, so `buildCSS` and `buildDtsFile` write through `writeFileAtomicSync`: a unique temporary file next to the target, renamed over it. Readers racing the write see the whole old file or the whole new one, the rename breaks the package manager's hardlink into its content-addressable store instead of mutating the shared copy, and a rename a lock refuses is retried before it fails the build.
- Internal package aliases such as `@/*` are only safe inside `packages/uniwind/src/bundler`. Bundler files are built and transformed to JS, but runtime/component/hook/HOC files are published directly as `.ts`/`.tsx` React Native entrypoints, so aliases in those files are not rewritten.

Metro integration:

- `withUniwindConfig(config, uniwindConfig)` patches Metro graph support for uncached modules.
- Metro adds `css` as source extension and removes it from asset extensions.
- Metro transformer handles the configured host CSS entry file and any host-declared inlined remote CSS entry files specially. In development, native entries declare imported local CSS files as Metro dependencies, including nested imports and workspace files resolved outside `node_modules`, so token-only edits trigger recompilation. Dependencies are collected afresh on each compile. Files in Uniwind's own package directory are never declared: it holds the stylesheets the transform writes (the project's artifact that `@import "uniwind"` resolves to and the shared `uniwind.css`), so declaring them would rebuild the entry after the transform's own writes, and the Metro servers of projects sharing one install (a federation host and its remotes) after each other's.
- Other native CSS is an empty module in plain Metro; Expo keeps its own CSS handling. Web CSS handling is unchanged.
- `experimental.optimizeClasslessComponents` (off by default) compiles classless native elements
  to raw React Native components; styled or uncertain references keep existing wrappers, and with
  `true` so do `Text` and `TextInput` while `defaultFontFamily` is on, because only their wrappers
  read the default font; a raw component is React Native's own export. The deprecated `SafeAreaView`
  always keeps its wrapper, because React Native warns when that export is read, and every export of
  the raw-component module gets read: by Fast Refresh in development, and on evaluation under Metro's
  non-live import/export transform.
  - Metro serializes `config.transformer` into its transform workers (structured clone) and hashes it into the transform cache key, so a predicate cannot reach the workers. The Metro adapter's `withUniwindConfig` resolves the option once, against the config's resolved `defaultFontFamily`, into `transformer.uniwind.optimizedClasslessComponents`: the enabled eligible components in eligible order. The predicate is dropped from the serialized config, which carries `defaultFontFamily` as the resolved boolean. A predicate that throws or returns a non-boolean (including a Promise) fails config creation with an error naming the component. The shared `UniwindBundlerConfig` does not depend on the Metro adapter.
  - That list is the only input for the transformer gate (native, non-asset files that mention `react-native` and an enabled component name), the Babel transform (rewrites only enabled components, for every reference shape it recognizes) and the resolver (`uniwind/.internal/raw-components` resolves only while the list is non-empty). The transformer serves the raw-component module as re-exports of the enabled components only, so disabled components are never read through it. Those come from `react-native` alone, so the module never pulls Uniwind's runtime into a federated remote. An empty list behaves like `false`.
  - Transform cache keys. Metro asks only the module at `transformerPath` for `getCacheKey`. It also hashes that module's file. Uniwind's transformer delegates `getCacheKey` to the upstream Metro/Expo worker, whose key hashes the whole transformer config. `expo start` and `expo export` replace a custom `transformerPath` with Expo's supervising worker; there, Expo's own `getCacheKey` hashes the same config, and neither Uniwind file is hashed. So `withUniwindConfig` also writes `transformer.uniwind.transformerFingerprint`, a hash of Uniwind's built `transformer.cjs` and `babel-transformer.cjs`. Those name their content-hashed shared chunks, so the hash covers the chunks too. On both paths, changing the resolved list, `defaultFontFamily` (which also shapes the web registration in `metro-injected.js`) or Uniwind's transform code invalidates cached transforms.
  - The Babel transformer reuses one component-transform options object per component list, because Babel caches plugin instances by options identity.
- Metro transformer worker selection is lazy, cached per Expo/non-Expo config type, and follows Expo transformer paths or Expo-specific config markers.
- Host native platform CSS transforms into a JS module that calls `Uniwind.__reinit(...)` with a fingerprint of the generated styles, themes, and runtime options, then the runtime options themselves. During development, the native runtime skips reinitialization when that fingerprint is unchanged, so toggling `defaultFontFamily` reinitializes even though the styles are the same. Mounted text that rendered with the option off subscribed to nothing and picks a newly enabled default up when it next renders.
- Federated remote native CSS transforms into an owner-keyed merge registration, declaring its imported stylesheets in development like a host entry.
- Inlined remote stylesheets compile with remote federation semantics inside the host graph, and in development declare their own imported stylesheets. Artifact generation remains tied to the host stylesheet so concurrent Metro workers write the same host artifact and typings.
- Each project compiles against its own generated stylesheet under the package's `.artifacts/`, keyed by every input that changes its content (`UniwindBundlerConfig.artifactKey`: the resolved CSS entry path, the theme list, and `defaultFontFamily`). Metro builds of different entries (a federation host and its remotes share a theme list but declare different theme variables) or of one entry with different configs can therefore run concurrently from one installed package without reading each other's artifact. `buildCSS` rewrites an artifact only when its content changed. Nothing prunes `.artifacts/`: it keeps one file per artifact key the install has built.
- The shared `uniwind.css` (the package `style` export) is only a last-writer copy for tools that import it directly; Metro builds don't depend on its content, and stylesheet discovery compiles against it only until the project has an artifact. A CSS transform copies its project's artifact there, through `writeFileAtomicSync`, only when that artifact changed since the process last copied it and the file differs. Warm transforms and alternating projects therefore leave the file, and the watchers that would react to a rewrite, alone. The copy is best-effort: when the package directory refuses it (`EACCES`, `EPERM`, `EROFS`), the transform carries on and reports it once through `Logger.warn`, which prints only while `Logger.debug` is set (no option sets it). The project artifact is not best-effort, because the build compiles against it: a read-only install builds the projects whose artifacts are already there and current, and fails one whose artifact is missing or stale. Vite and the CLI still generate the shared file itself, and builds through them compile against it.
- Web platform CSS transforms into CSS plus web runtime setup. `metro-injected.js` becomes the web registration, `Uniwind.__reinit` with the themes and, except in a federated remote, the runtime options.
- Resolver swaps React Native component imports to Uniwind-aware implementations where needed.
- On web, imports originating inside React Native Web keep their original components, preventing cycles through Uniwind wrappers. Animated component imports still receive wrappers, matching the native resolver, and the internal `createOrderedCSSStyleSheet` override remains active. Application and third-party component imports still resolve to styled wrappers.
- `uniwind` and `uniwind/*` requests first resolve from the importing module, so upstream virtual and provider-origin resolutions (such as Module Federation shared modules) are kept. When that resolution fails or lands in a different installed `uniwind` package, the request is pinned to `<projectRoot>/package.json`, so every importer gets the app's copy. If the pinned resolution still returns a source file outside this package (e.g. Expo autolinking resolution picks a hoisted public `uniwind` while Pro is installed under an alias such as `"uniwind": "npm:uniwind-pro"`), the request is resolved again with Metro's default `metro-resolver`.

Vite integration:

- `uniwind(config)` returns a pre-Vite plugin.
- Vite aliases `react-native` to Uniwind web components, except imports from Uniwind internals resolve back to `react-native-web`.
- Vite replaces RNW `createOrderedCSSStyleSheet` with Uniwind's ordered stylesheet implementation.
- Vite uses Lightning CSS with `UniwindCSSVisitor`.
- Vite generates artifacts on `buildStart` and `generateBundle`.
- Vite appends `Uniwind.__reinit` with the themes and runtime options to Uniwind's built config module.

## CSS Processing

Native processing converts Tailwind-generated CSS into metadata-rich style records.

Important concepts:

- A `Style` record stores entries, breakpoint bounds, orientation, theme, RTL, native flag, dependencies, source index, class name, important properties, selector complexity, pseudo-states, and data attributes.
- CSS variables live in `vars`; theme and platform-scoped variables live in `scopedVars` with internal prefixes.
- The processor treats declarations under `:root` or outside class rules as variables.
- Theme variants are recognized from known theme names.
- Variant tokens (`:active`, `:focus`, `:disabled`, `:where(.theme)`, `:dir()`, `[data-x]`) are read from two selector shapes: nested under the class as `&:active` (Tailwind < 4.3.3) and flattened into the class selector as `.active\:x:active` (Tailwind >= 4.3.3). A selector carrying any token the runtime cannot observe (e.g. `[aria-disabled="true"]`, alone or stacked with a supported variant) is skipped, never applied under a weaker condition.
- Data attribute variants support boolean `data-x` and exact `data-x="value"` matching against component props.
- Media queries drive dimensions, orientation, color scheme, platform, and native/web-specific metadata. Native exclusive width bounds use the generated artifact's `0.01pt` numeric precision to exclude equality, including bounds expressed with viewport-relative units.
- Important declarations are preserved as `importantProperties`.
- Unsupported CSS features may be silently ignored on native. Prefer documenting support coverage over adding noisy runtime failures for every unsupported CSS construct.
- Tailwind composes `filter` from per-utility `--tw-*` variables and relies on `var(--x,)` empty fallbacks for unset parts, so `Var` resolves those to an empty string. Each filter function compiles to `rt.filterFn(name, amount, unit)` because `addMissingSpaces` would otherwise corrupt an inline `blur(${...}px)` template.
- Filter runtime support is platform-dependent: Android applies filters at the default release level (blur and drop-shadow need API 31+, and one blur in the chain sends the whole chain down that path), while iOS renders blur/grayscale/saturate/contrast/hue-rotate only behind the `enableSwiftUIBasedFilters` React Native feature flag — experimental in RN 0.83-0.86, canary in 0.87, absent before 0.83.
- `backdrop-filter` has no RN equivalent and is still dropped.
- `text-align: start/end` passes through as `textAlign`; RN resolves `end` from 0.87 (older versions fall back to natural alignment).
- `font-variation-settings` maps to `fontVariationSettings` with axis tags re-quoted at runtime once variables resolve (`'wght' 650`), which RN applies from 0.88; unquoted tags are rejected on both iOS and Android.

Web visitor behavior:

- Theme root rules in Tailwind theme layer become theme class rules, whether the variant is nested under `:root` (Tailwind < 4.3.3) or flattened into `:root:where(.dark, .dark *)` (Tailwind >= 4.3.3).
- Theme-prefixed class rules are scoped with CSS `@scope` to selected theme classes and excluded from other themes.
- Visitor state is cleaned between transforms.

## Components And HOC

Native components:

- Native wrappers import the underlying `react-native` component.
- `useStyle(className, props, state)` resolves `className` through `UniwindStore` and subscribes to style dependencies.
- Most components combine generated style before user style: `[generatedStyle, props.style]`, preserving user overrides.
- Stateful components such as `Pressable` pass `pressed`, `focused`, and `disabled` state into style resolution.
- Accent-capable components use `accentColor` extraction helpers where needed.
- With `defaultFontFamily` on, root `Text` and `TextInput` start from the theme's `--default-font-family`, the token Tailwind's preflight puts on the web root, when it names a single family; React Native cannot resolve a fallback list or a CSS-wide keyword, so those keep the platform default. It also expects a bare name, so the quotes a value set at runtime may carry are stripped. Tailwind's default theme derives the token from `--font-sans`. Nested text inherits from its parent; a `TextInput` never inherits an enclosing `Text`'s attributes, so one inside a `Text` starts from the default too, as on web. `className` and `style` still override: the family is added to the generated style only while no class sets one. `experimental.optimizeClasslessComponents: true` therefore keeps classless `Text` and `TextInput` on the wrapper while the option is on: only the wrapper reads the variable, and the raw component is React Native's own export. A predicate that enables them anyway sends their classless usages raw, without the default font. `useStyle` reads the default for them inside its existing subscription, so they add no hook or effect of their own. All root text in a scope shares one lookup per change of the theme or the variables, and it re-renders only when its resolved family changes: under `ScopedTheme` it ignores global theme changes, and nested text and text whose className sets a family subscribe to nothing for it. With the option off, `Text` and `TextInput` subscribe to nothing for it, mount the hooks they mounted before the option existed, and pass React Native the same style arrays.

Web components:

- Web wrappers import from `react-native` as resolved by bundler aliases.
- Web wrappers map `className` to RNW CSS style markers through `toRNWClassName`.
- Web wrappers pass generated `dataSet` so data attribute variants can match.
- `InputAccessoryView` wraps React Native Web's export when available (0.21.3+) and uses `View` with older React Native Web versions, while supporting Uniwind classes and data attributes.
- React Native Web resets root text and inputs to `font: 14px System` in `@layer rnw`, so root text skips the page font Tailwind's Preflight puts on `html`. Inputs don't: Preflight's `input { font: inherit }` in `@layer base` beats that reset, so with Preflight they inherit their container's font. With `defaultFontFamily` on, web `Text` and `TextInput` carry the `uniwind-default-font` class that the artifact then declares in `@layer base`: it beats RNW's reset and loses to font utilities by layer, which survives the rule re-sorting RNW applies when it serializes the sheet for static rendering. On an input the class also replaces Preflight's inheritance on purpose, so a `TextInput` inside a container with a font class starts from the default font, as on native, where a `View`'s font never reaches a `TextInput`. Because the rule reads the token, Tailwind emits `--default-font-family` for those configs whenever the theme defines `--font-sans`, with or without preflight; when the token is unset (no `--font-sans`, or `--default-font-family: initial`), the rule falls back to RNW's System stack, so those apps keep the reset font. The rule sits behind the `web:` variant's `@supports selector(div > div)` condition, which native compiles skip, so native stylesheets and federated remotes carry no dead copy; native `Text` and `TextInput` read the token directly. Uniwind `Text` marks its subtree so nested text keeps inheriting. With the option off, neither carries the class nor marks a subtree, so they render React Native Web's DOM as before. Web caveats with the option on:
  - Layer order: `base` sits below `utilities` only when the CSS entry declares Tailwind's layer order (`@layer theme, base, components, utilities;`) before it imports `uniwind`. `@import "tailwindcss"` starts with that statement, and Tailwind's setup without Preflight states it. An entry that imports Tailwind's parts without it first declares `base` inside the artifact, after `utilities`, and the default font then beats font utilities on root text and inputs.
  - Scoped overrides: Tailwind declares `--default-font-family: var(--font-sans)` on the root, where the browser resolves it once and descendants inherit the result, while native resolves the token per scope. So a `ScopedTheme` or `ScopedVariables` override of `--font-sans` reaches root text only on native; one meant for both platforms sets `--default-font-family` itself. Global theme switches apply on both, because the theme class sits on the root.
  - Raw React Native Web `Text`: web tracks nesting through Uniwind's own context, because reading RNW's would take a deep import that Vite's pre-bundled `react-native-web` doesn't share. A Uniwind `Text` inside a raw RNW `Text`, one imported from `react-native-web` itself, therefore starts from the default font instead of inheriting; native reads React Native's own context and inherits.

`withUniwind`:

- Auto mode maps `className`-style props to matching RN style props and color class props to color props.
- Manual mode maps custom class props to custom target props and can extract a single style property.
- Native mode resolves to concrete RN style objects.
- Web mode usually emits RNW CSS style markers and uses computed style only for extracted values.

## Federated Style Contract

- The host owns the base/global CSS. Remote-owned classes and CSS variables must use explicit owner prefixes on web and native; owner-keyed native merging scopes registration lifecycle, not class or variable names, so unprefixed remote-owned styles can still collide. Remote web CSS drops Uniwind's own `uniwind-default-font` base rule: the host's stylesheet carries it, and remote text carries the class only when it renders through the host's Uniwind components (see `defaultFontFamily`).
- Shared class candidates are an explicit build-time contract. Host builds include them, remote scanner candidates exclude them, and remote source uses them unprefixed so they resolve from the host on web and native.
- `@source inline(...)` candidates are compiled by Tailwind outside Uniwind's scanner candidate set. Remote authors must not reintroduce shared candidates through inline sources.
- Native deltas merge by owner; existing keys win, same-owner registration replaces, and non-federated `__reinit` behavior is unchanged.
- Inlined remote entries inherit the host theme list, compile as owner-keyed remote deltas, and do not replace the host-derived shared `uniwind.css` artifact.
- Native registrations must use the same ordered theme list. A remote may register before the host; the first remote establishes the provisional public theme list, and host initialization validates those themes before changing config or store state.

## Testing And Quality Gates

Package scripts:

- `bun run build`: unbuild package outputs.
- `bun run check:typescript`: TypeScript no-emit check.
- `bun run lint`: oxlint on `src`.
- `bun run circular:check`: dpdm circular dependency check.
- `bun run test:native`: Jest native tests.
- `bun run test:web`: Vitest web tests.
- `bun run test:types`: type-level tests.
- `bun run test:e2e`: Playwright e2e tests.

Root scripts use Turbo for monorepo-wide build, typecheck, lint, test, format, and circular checks.

The release workflow runs the build, type checks, lint, formatting, circular dependency checks, and all test suites before releasing. It uses release-it to bump the version and generate the changelog, then follows release-it's default order: publish to npm, push the release commit/tag, and create the GitHub release. Husky is disabled for the release commit because the workflow has already run the checks. The package's release-it configuration controls npm provenance, public access, and prerelease tags. Dry runs use release-it's `--dry-run`, and pending release issues are closed only after the full release succeeds.

Testing layout:

- `tests/native`: component behavior and native style parsing.
- `tests/web`: web config, components, and HOC behavior.
- `tests/type-test`: public type expectations.
- `tests/e2e`: browser checks for web style extraction and generated artifacts.

Native test setup disables Node's optional `module.register` and `module.registerHooks` before importing Tailwind. Jest 30 cannot run these loader hooks in its module sandbox; Tailwind uses its normal module-loading path when the hooks are unavailable.

From the sources, the Metro adapter's artifact paths (`artifact-paths.ts`: the package directory, which development builds never declare a stylesheet dependency in, the shared stylesheet, and the project artifacts) resolve inside `src/bundler`, which `files` publishes and the build copies into `dist`. Tests that run CSS transforms therefore mock that module with `tests/native/bundler/temporaryArtifactPaths.ts`, which gives each test file its own directory and removes it afterwards.

The bare example's React Native CLI uses Metro 0.84 internally. The Metro development dependency follows the root `metro` catalog entry, which matches the version `@expo/metro` pins (0.84.5), so the hoisted `metro` and `metro-resolver` are the copies Expo loads. It stays below 0.86 until that CLI is upgraded: Metro 0.86/0.87 transformer workers emit full source maps that the older CLI serializer cannot consume. Metro dependency upgrades must pass the bare production bundle checks.

Source-of-truth policy: repository code and tests win for implementation details. External docs at `docs.uniwind.dev` describe intended public behavior and should be updated when public behavior changes.

## Engineering Constraints

- Runtime performance matters. Prefer build-time CSS processing and narrow runtime invalidation over broad recomputation.
- Preserve user style precedence when adding component wrappers.
- Keep native and web behavior aligned unless platform constraints require divergence.
- Any new runtime dependency should map to `StyleDependency` and invalidate only affected subscribers.
- Theme-aware changes must account for global theme, adaptive system theme, and `ScopedTheme`.
- CSS variables must keep lazy getter semantics on native because values may depend on current runtime state.
- Avoid introducing compatibility paths without known consumers or persisted behavior.
- Add tests for native, web, and types when changing public API or cross-platform behavior.
