import { useEffect } from "react";
import { MobileHeader, TabBar, TopNav } from "@/components/Shell";
import { SettingsDialog } from "@/components/SettingsDialog";
import { dataSource } from "@/lib/api";
import { dm, MONTH_ABBR } from "@/lib/format";
import { capsFor, HomeProvider, routeAvailable } from "@/lib/home";
import { useHomes } from "@/lib/hooks";
import { DESKTOP_QUERY, useMedia } from "@/lib/layout";
import { useModel } from "@/lib/model";
import { navigate, setCurrentHome, useRoute, type Route } from "@/lib/router";
import type { Home } from "@/lib/types";
import { Battery } from "@/pages/Battery";
import { Day } from "@/pages/Day";
import { Health } from "@/pages/Health";
import { Overview } from "@/pages/Overview";
import { Savings } from "@/pages/Savings";
import { Trends } from "@/pages/Trends";

const loadError = (error: unknown) => (
  <div className="state" role="alert">
    <strong>Couldn't load the data.</strong>{" "}
    {dataSource === "api"
      ? "Is the momsolar API running (VITE_API_BASE_URL)?"
      : "Expected public/data/homes.json and data/<home>/daily.csv, bills.csv — run scripts/refresh_all.sh."}{" "}
    <span className="muted">({String((error as Error)?.message ?? error)})</span>
  </div>
);

export function App() {
  const { home: homeId, route, params } = useRoute();
  const homes = useHomes();
  if (homes.error) return <div className="app">{loadError(homes.error)}</div>;
  if (!homes.data) return <div className="app state muted">Loading…</div>;
  if (!homes.data.length) return <div className="app">{loadError("homes.json lists no homes")}</div>;
  const home = homes.data.find((h) => h.id === homeId) ?? homes.data[0];
  setCurrentHome(home.id);
  return (
    <HomeProvider value={{ home, homes: homes.data }}>
      {/* key: a different home is a fresh page state (period, picked month, hover…). */}
      <HomeApp key={home.id} home={home} route={route} params={params} />
    </HomeProvider>
  );
}

function HomeApp({ home, route, params }: { home: Home; route: Route; params: URLSearchParams }) {
  const desktop = useMedia(DESKTOP_QUERY);
  const { model, fiveMin, daily, bills, bms, error } = useModel(home);
  const mobile = !desktop;
  const caps = model ? capsFor(home, model.dates) : null;
  const available = !caps || routeAvailable(route, caps);

  // A page this home has no data for (e.g. Battery after switching to a home without one).
  useEffect(() => {
    if (!available) navigate("overview", undefined, home.id);
  }, [available, home.id]);

  const lastBill = model?.savings.bills.at(-1);
  const status =
    route === "savings" && lastBill
      ? `${home.utility} Log · last bill ${MONTH_ABBR[lastBill.month - 1]} ${lastBill.year}`
      : (model?.updated ?? "Loading…");

  let body: React.ReactNode;
  if (error) body = loadError(error);
  else if (!model || !caps || !available) body = <div className="state muted">Loading data…</div>;
  else if (route === "overview") body = <Overview mobile={mobile} fiveMin={fiveMin} daily={daily} model={model} caps={caps} />;
  else if (route === "day") body = <Day mobile={mobile} fiveMin={fiveMin} model={model} date={params.get("d")} />;
  else if (route === "savings") body = <Savings mobile={mobile} model={model} bills={bills} daily={daily} />;
  else if (route === "trends") body = <Trends mobile={mobile} daily={daily} model={model} />;
  else if (route === "battery") body = <Battery mobile={mobile} fiveMin={fiveMin} daily={daily} model={model} />;
  else body = <Health mobile={mobile} fiveMin={fiveMin} bms={bms} model={model} />;

  const navCaps = caps ?? { fiveMin: false, battery: home.battery != null };
  return (
    <div className={`app ${desktop ? "app-desktop" : "app-mobile"}`}>
      {desktop ? (
        <TopNav route={route} status={status} caps={navCaps} />
      ) : (
        <MobileHeader route={route} time={model ? model.lastTime || dm(model.asOf) : "—"} />
      )}
      <main style={mobile ? { paddingBottom: 24 } : undefined}>{body}</main>
      {mobile && <TabBar route={route} caps={navCaps} />}
      <SettingsDialog />
    </div>
  );
}
