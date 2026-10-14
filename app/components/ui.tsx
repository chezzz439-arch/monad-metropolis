/**
 * The shared pieces every screen is built from.
 *
 * Nothing here knows about circles, payments or the SDK — these are the
 * buttons, cards, chips and empty states, and they read all their colours and
 * spacing from `design/tokens`. A screen that needs a one-off style should
 * gain a variant here instead, so the app keeps looking like one app.
 */
import { useEffect, useRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { color, nativeDriver, radius, shadow, space, tap, type } from "../design/tokens";
import { initials } from "../design/copy";

// -- layout ----------------------------------------------------------------

export function Screen({
  children,
  edges = ["top", "bottom"],
  style,
}: {
  children: ReactNode;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView style={[styles.screen, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/**
 * The top of a screen. A back arrow when there is somewhere to go back to,
 * otherwise the wordmark — the full logo is saved for the welcome screen,
 * where there is room to give it.
 */
export function AppBar({
  title,
  onBack,
  right,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.appBar}>
      <View style={styles.appBarLeft}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        {title ? (
          <Text style={styles.appBarTitle} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <Text style={styles.wordmark}>Chit Circle</Text>
        )}
      </View>
      {right}
    </View>
  );
}

/** The bottom of the app. Two places to be, so no icons are needed to tell them apart. */
export function TabBar<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly T[];
  active: T;
  onSelect: (tab: T) => void;
}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((item) => (
        <Pressable
          key={item}
          onPress={() => onSelect(item)}
          style={styles.tab}
          accessibilityRole="button"
          accessibilityState={{ selected: item === active }}
        >
          <View style={[styles.tabMark, item === active && styles.tabMarkActive]} />
          <Text style={[styles.tabText, item === active && styles.tabTextActive]}>{item}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionTitleText}>{children}</Text>
      {right}
    </View>
  );
}

// -- controls --------------------------------------------------------------

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inert = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inert, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        pressed && variant === "primary" && styles.buttonPrimaryPressed,
        pressed && variant !== "primary" && styles.buttonQuietPressed,
        inert && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? color.onBrand : color.brand} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === "primary" ? styles.buttonLabelPrimary : styles.buttonLabelQuiet,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function TextField(props: TextInputProps) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={color.inkFaint}
      style={[styles.input, props.style]}
    />
  );
}

// -- identity --------------------------------------------------------------

export function Avatar({
  name,
  size = 44,
  tone = "neutral",
}: {
  name: string;
  size?: number;
  tone?: "neutral" | "brand" | "missed";
}) {
  const palette =
    tone === "brand"
      ? { bg: color.brand, fg: color.onBrand }
      : tone === "missed"
        ? { bg: color.missedSoft, fg: color.missed }
        : { bg: color.brandSoft, fg: color.brand };
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.bg },
      ]}
    >
      <Text style={[styles.avatarText, { color: palette.fg, fontSize: Math.round(size * 0.38) }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function Chip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "paid" | "due" | "missed" | "highlight";
}) {
  const palette = {
    neutral: { bg: color.sunken, fg: color.inkMuted },
    paid: { bg: color.paidSoft, fg: color.paid },
    due: { bg: color.dueSoft, fg: color.due },
    missed: { bg: color.missedSoft, fg: color.missed },
    highlight: { bg: color.highlightSoft, fg: color.due },
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      <Text style={[styles.chipText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * Round 3 of 5, as five dots. Reads faster than "3/5" and takes the same room.
 *
 * `on` is the surface behind it: the finished dots are brand navy, which is
 * also the pot card's background, so on dark they have to flip to a light tint
 * or they vanish and the round looks like it never started.
 */
export function ProgressDots({
  total,
  current,
  on = "light",
}: {
  total: number;
  current: number;
  on?: "light" | "dark";
}) {
  const dark = on === "dark";
  return (
    <View style={styles.dots} accessibilityLabel={`Round ${current} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            dark && styles.dotOnDark,
            index < current - 1 && (dark ? styles.dotDoneOnDark : styles.dotDone),
            index === current - 1 && styles.dotCurrent,
          ]}
        />
      ))}
    </View>
  );
}

// -- states ----------------------------------------------------------------

/**
 * A soft pulsing block, shown in the shape of the content it is standing in
 * for. A spinner says "something is happening"; this says "your circles are
 * about to be here", which is the calmer message on a screen that is about
 * other people's money.
 */
export function Skeleton({
  width,
  height,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 760, useNativeDriver: nativeDriver }),
        Animated.timing(pulse, { toValue: 0.6, duration: 760, useNativeDriver: nativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[styles.skeleton, { height, borderRadius: Math.min(height / 2, radius.sm) }, width !== undefined && { width }, { opacity: pulse }, style]}
    />
  );
}

export function EmptyState({
  title,
  body,
  action,
  art,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  art?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      {art}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/** One sentence and a way out. The only error shape in the app. */
export function ErrorNote({
  message,
  onRetry,
  retryLabel = "Try again",
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.errorNote} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.errorRetry} accessibilityRole="button">
          <Text style={styles.errorRetryText}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The full logo, for the one screen with room to show it properly. Points at
 * the 512px copy rather than the 2000px master: the master is for the app icon
 * and the submission form, and shipping it would cost a phone 1.6MB before the
 * first screen paints.
 */
export function Logo({ size = 150 }: { size?: number }) {
  return (
    <View style={[styles.logoTile, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Image
        source={require("../../assets/logo-512.png")}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityLabel="Chit Circle"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },

  appBar: {
    minHeight: 60,
    paddingHorizontal: space.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
  },
  appBarLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: space.xs },
  appBarTitle: { ...type.heading, color: color.ink, flex: 1 },
  wordmark: { ...type.heading, color: color.brand, letterSpacing: -0.4 },
  backButton: { width: tap.min, height: tap.min, marginLeft: -space.md, alignItems: "center", justifyContent: "center" },
  backGlyph: { fontSize: 34, lineHeight: 38, color: color.brand, marginTop: -4 },

  tabs: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingBottom: space.xs,
  },
  tab: { flex: 1, minHeight: 60, alignItems: "center", justifyContent: "center", gap: space.sm },
  tabMark: { width: 24, height: 3, borderRadius: 2, backgroundColor: "transparent" },
  tabMarkActive: { backgroundColor: color.highlight },
  tabText: { ...type.label, color: color.inkMuted },
  tabTextActive: { color: color.ink, fontWeight: "700" },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    padding: space.xl,
    borderWidth: 1,
    borderColor: color.line,
    ...shadow,
  },
  cardPressed: { backgroundColor: color.sunken },
  divider: { height: 1, backgroundColor: color.line },

  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.md,
  },
  sectionTitleText: { ...type.heading, color: color.ink },

  button: {
    minHeight: tap.primary,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
  },
  buttonPrimary: { backgroundColor: color.brand },
  buttonPrimaryPressed: { backgroundColor: color.brandPressed },
  buttonSecondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  buttonGhost: { minHeight: tap.min, backgroundColor: "transparent" },
  buttonQuietPressed: { backgroundColor: color.sunken },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...type.bodyStrong },
  buttonLabelPrimary: { color: color.onBrand },
  buttonLabelQuiet: { color: color.brand },

  field: { marginBottom: space.xl },
  fieldLabel: { ...type.label, color: color.inkMuted, marginBottom: space.sm },
  fieldHint: { ...type.label, color: color.inkFaint, marginTop: space.sm },
  input: {
    minHeight: tap.primary,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    ...type.body,
    color: color.ink,
  },

  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "700" },

  chip: {
    minHeight: 28,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    justifyContent: "center",
  },
  chipText: { ...type.caption },

  dots: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.line },
  dotOnDark: { backgroundColor: "rgba(255, 255, 255, 0.24)" },
  dotDone: { backgroundColor: color.brand },
  dotDoneOnDark: { backgroundColor: "#8FA8CC" },
  dotCurrent: { backgroundColor: color.highlight, width: 26, borderRadius: 5 },

  skeleton: { backgroundColor: color.sunken },

  // The artwork carries its own near-white backdrop, so it gets a rounded tile
  // rather than being floated on the warm canvas with a visible seam.
  logoTile: { backgroundColor: "#FDFCFA", overflow: "hidden", ...shadow },

  empty: { alignItems: "center", paddingVertical: space.huge, paddingHorizontal: space.xl },
  emptyTitle: { ...type.title, color: color.ink, textAlign: "center", marginTop: space.lg },
  emptyBody: {
    ...type.body,
    color: color.inkMuted,
    textAlign: "center",
    marginTop: space.md,
    maxWidth: 300,
  },
  emptyAction: { marginTop: space.xxl, alignSelf: "stretch" },

  errorNote: {
    backgroundColor: color.missedSoft,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
  errorText: { ...type.body, color: color.missed },
  errorRetry: { minHeight: tap.min, justifyContent: "center", alignSelf: "flex-start" },
  errorRetryText: { ...type.bodyStrong, color: color.missed, textDecorationLine: "underline" },
});
