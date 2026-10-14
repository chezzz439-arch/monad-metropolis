/**
 * Every screen, on demand, on fake data.
 *
 * Reached only by adding `?screen=` to the URL, so it is invisible to anyone
 * using the app and costs the normal path nothing. It exists because the
 * states worth checking — a missed payment, an empty home, a network that is
 * down — are the ones you cannot reach by tapping through a working demo, and
 * they are exactly the ones a judge will land on.
 *
 * It renders the real screens through the real hooks against the SDK's mock
 * client, so what you see here is what ships.
 */
import { useMemo } from "react";
import { View } from "react-native";
import {
  ChitCircleProvider,
  MOCK_ME,
  MOCK_TOKEN,
  mockClient,
  monadTestnet,
  type ScenarioName,
} from "../../sdk/src/index";
import { AppBar, Avatar, Screen, TabBar } from "../components/ui";
import { CircleListScreen } from "../screens/CircleListScreen";
import { CreateCircleScreen } from "../screens/CreateCircleScreen";
import { LiveCircleDetailScreen } from "../screens/LiveCircleDetailScreen";
import { SendReceiveScreen } from "../screens/SendReceiveScreen";
import { SettingUpScreen } from "../screens/SettingUpScreen";
import { SuccessScreen } from "../screens/SuccessScreen";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { color } from "../design/tokens";

/** `?screen=home` — null for every normal visit. */
export function galleryTarget(): string | null {
  if (typeof window === "undefined" || typeof window.location === "undefined") return null;
  return new URLSearchParams(window.location.search).get("screen");
}

const NAMES = { "0": "Sunday Table" };

/** Somebody with no circles, for rendering an invited visitor's view. */
const STRANGER = "0x00000000000000000000000000000000000Fa11e5" as const;

export function Gallery({ screen }: { screen: string }) {
  const render = SCREENS[screen] ?? SCREENS.welcome!;
  return render();
}

/** The chrome every signed-in screen sits inside, matching the real shell. */
function Shell({
  scenario,
  title,
  onBack,
  tab = "Circles",
  children,
}: {
  scenario?: ScenarioName;
  title?: string;
  onBack?: boolean;
  tab?: "Circles" | "Send";
  children: (client: ReturnType<typeof mockClient>) => React.ReactNode;
}) {
  const client = useMemo(() => mockClient({ scenario: scenario ?? "midRound", latencyMs: 0 }), [scenario]);
  return (
    <ChitCircleProvider value={client}>
      <Screen>
        <AppBar
          title={title}
          onBack={onBack ? () => {} : undefined}
          right={<Avatar name="You" size={40} tone="brand" />}
        />
        {children(client)}
        {onBack ? null : <TabBar tabs={["Circles", "Send"] as const} active={tab} onSelect={() => {}} />}
      </Screen>
    </ChitCircleProvider>
  );
}

const SCREENS: Record<string, () => React.ReactElement> = {
  welcome: () => (
    <WelcomeScreen returning={false} busy={false} error={null} onGetStarted={() => {}} onSignIn={() => {}} />
  ),

  "welcome-returning": () => (
    <WelcomeScreen returning busy={false} error={null} onGetStarted={() => {}} onSignIn={() => {}} />
  ),

  "welcome-error": () => (
    <WelcomeScreen
      returning={false}
      busy={false}
      error="That confirmation was cancelled. Tap again and confirm with your face, fingerprint or PIN."
      onGetStarted={() => {}}
      onSignIn={() => {}}
    />
  ),

  /** Landing on an invite link while signed out — the second member's first screen. */
  "welcome-invited": () => (
    <WelcomeScreen returning={false} busy={false} error={null} invited onGetStarted={() => {}} onSignIn={() => {}} />
  ),

  /** A link that arrived truncated, which is what a group chat does to long URLs. */
  "welcome-bad-link": () => (
    <WelcomeScreen
      returning={false}
      busy={false}
      invited={false}
      error="That invite link looks incomplete. Ask whoever sent it to share it again."
      onGetStarted={() => {}}
      onSignIn={() => {}}
    />
  ),

  setup: () => <SettingUpScreen failed={false} onRetry={() => {}} onContinue={() => {}} />,

  "setup-failed": () => <SettingUpScreen failed onRetry={() => {}} onContinue={() => {}} />,

  /** Funding worked: the account has gas and money, and is told the amount. */
  "setup-funded": () => (
    <SettingUpScreen
      failed={false}
      ready={{ kind: "granted", sent: 500_000_000n, balance: 500_000_000n, hash: "0x0" }}
      onRetry={() => {}}
      onContinue={() => {}}
    />
  ),

  /** The dripper ran out mid-demo. A sentence someone can act on, not an error. */
  "setup-dry": () => (
    <SettingUpScreen
      failed={false}
      ready={{ kind: "funder-empty", balance: 0n }}
      onRetry={() => {}}
      onContinue={() => {}}
    />
  ),

  home: () => (
    <Shell scenario="midRound">
      {() => (
        <CircleListScreen
          myAccount={MOCK_ME}
          names={NAMES}
          onSelectCircle={() => {}}
          onCreateNew={() => {}}
        />
      )}
    </Shell>
  ),

  "home-empty": () => (
    <Shell scenario="empty">
      {() => (
        <CircleListScreen myAccount={MOCK_ME} names={{}} onSelectCircle={() => {}} onCreateNew={() => {}} />
      )}
    </Shell>
  ),

  "home-error": () => <HomeError />,

  /** Straight after signing in on a device that holds nothing. */
  "home-welcome-back": () => (
    <Shell scenario="midRound">
      {() => (
        <CircleListScreen
          myAccount={MOCK_ME}
          names={NAMES}
          welcomeBack
          onSelectCircle={() => {}}
          onCreateNew={() => {}}
        />
      )}
    </Shell>
  ),

  detail: () => (
    <Shell scenario="midRound" title="Sunday Table" onBack>
      {() => (
        <LiveCircleDetailScreen
          circleId={0n}
          account={MOCK_ME}
          canWrite
          deployment={monadTestnet}
          onBack={() => {}}
        />
      )}
    </Shell>
  ),

  /**
   * Where the organizer lands straight after creating, and where an invited
   * member lands before joining: the circle is not full, so "Invite members"
   * and "Join for $100" are the only things on offer.
   */
  "detail-filling": () => (
    <Shell scenario="filling" title="Sunday Table" onBack>
      {() => (
        <LiveCircleDetailScreen
          circleId={0n}
          account={MOCK_ME}
          canWrite
          deployment={monadTestnet}
          onBack={() => {}}
        />
      )}
    </Shell>
  ),

  /** The same circle seen by someone who has not joined it yet. */
  "detail-join": () => (
    <Shell scenario="filling" title="Circle #1" onBack>
      {() => (
        <LiveCircleDetailScreen
          circleId={0n}
          account={STRANGER}
          canWrite
          deployment={monadTestnet}
          onBack={() => {}}
        />
      )}
    </Shell>
  ),

  "detail-settle": () => (
    <Shell scenario="settleable" title="Sunday Table" onBack>
      {() => (
        <LiveCircleDetailScreen
          circleId={0n}
          account={MOCK_ME}
          canWrite
          deployment={monadTestnet}
          onBack={() => {}}
        />
      )}
    </Shell>
  ),

  /**
   * A link that arrived too late: the circle filled up and started without
   * them. The same scenario as `detail-settle`, read by someone with no stake
   * in it — who must not be offered the settle button sitting one state away.
   */
  "detail-closed": () => (
    <Shell scenario="settleable" title="Circle #1" onBack>
      {() => (
        <LiveCircleDetailScreen
          circleId={0n}
          account={STRANGER}
          canWrite
          deployment={monadTestnet}
          onBack={() => {}}
        />
      )}
    </Shell>
  ),

  missed: () => (
    <Shell scenario="defaulted" title="Sunday Table" onBack>
      {() => (
        <LiveCircleDetailScreen
          circleId={0n}
          account={MOCK_ME}
          canWrite
          deployment={monadTestnet}
          onBack={() => {}}
        />
      )}
    </Shell>
  ),

  send: () => (
    <Shell scenario="midRound" tab="Send">
      {() => <SendReceiveScreen tokenAddress={MOCK_TOKEN} myAccount={MOCK_ME} />}
    </Shell>
  ),

  create: () => <CreateSheet />,

  success: () => (
    <SuccessScreen
      celebration={{
        title: "You received $500",
        body: "It is in your balance already.",
        settledInSeconds: 1.2,
        reference: "0x9f2c41a7b6e0d35c8a14f7b92e6c0d4a7318fb52c9e04d16a8b7f3c25d901e4b",
      }}
      onDone={() => {}}
    />
  ),

  "success-missed": () => (
    <SuccessScreen
      celebration={{
        title: "You received $500",
        missed: "Priya missed this round — their deposit covered it. The pot is still full.",
        settledInSeconds: 1.2,
        reference: "0x9f2c41a7b6e0d35c8a14f7b92e6c0d4a7318fb52c9e04d16a8b7f3c25d901e4b",
      }}
      onDone={() => {}}
    />
  ),
};

/**
 * A client whose discovery call always fails, so the home screen's error state
 * renders through the same path a real outage would take.
 */
function HomeError() {
  const client = useMemo(() => {
    const broken = mockClient({ scenario: "midRound", latencyMs: 0 });
    (broken as unknown as { myCircles: () => Promise<never> }).myCircles = () =>
      Promise.reject(new Error("HTTP request failed"));
    return broken;
  }, []);

  return (
    <ChitCircleProvider value={client}>
      <Screen>
        <AppBar right={<Avatar name="You" size={40} tone="brand" />} />
        <CircleListScreen myAccount={MOCK_ME} names={{}} onSelectCircle={() => {}} onCreateNew={() => {}} />
        <TabBar tabs={["Circles", "Send"] as const} active="Circles" onSelect={() => {}} />
      </Screen>
    </ChitCircleProvider>
  );
}

function CreateSheet() {
  const client = useMemo(() => mockClient({ scenario: "empty", latencyMs: 0 }), []);
  return (
    <ChitCircleProvider value={client}>
      <View style={{ flex: 1, backgroundColor: color.canvas }}>
        <CreateCircleScreen tokenAddress={MOCK_TOKEN} onClose={() => {}} onCreated={() => {}} />
      </View>
    </ChitCircleProvider>
  );
}
