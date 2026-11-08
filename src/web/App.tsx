import type { ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { ToastHost } from "./components.tsx";
import { DataProvider, useData } from "./data.tsx";
import { CatalogPage, DuplicatesPage, GroceryPage } from "./pages/Catalog.tsx";
import { ListPage, ListsPage } from "./pages/Lists.tsx";
import { OrderPage } from "./pages/Order.tsx";
import { RecipeEditPage, RecipePage, RecipesPage } from "./pages/Recipes.tsx";

const icons: Record<string, ReactNode> = {
  order: <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2M10 20.5h.01M17 20.5h.01" />,
  recipes: <path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2V5Zm4 0v16M11 8h4M11 12h4" />,
  lists: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  catalog: <path d="M4 7l8-4 8 4v10l-8 4-8-4V7Zm0 0l8 4 8-4M12 11v10" />,
};

function Tab({ href, label, icon }: { href: string; label: string; icon: string }) {
  const [location] = useLocation();
  const on = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link href={href} className={on ? "on" : ""} aria-current={on ? "page" : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icons[icon]}
      </svg>
      {label}
    </Link>
  );
}

function Routes() {
  const { error } = useData();
  const num = (s: string | undefined) => Number(s);
  return (
    <>
      {error && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <p className="note">Couldn't reach the server: {error}</p>
        </div>
      )}
      <Switch>
        <Route path="/" component={OrderPage} />
        <Route path="/recipes" component={RecipesPage} />
        <Route path="/recipes/new">{() => <RecipeEditPage id={null} />}</Route>
        <Route path="/recipes/:id/edit">{(p) => <RecipeEditPage key={p.id} id={num(p.id)} />}</Route>
        <Route path="/recipes/:id">{(p) => <RecipePage key={p.id} id={num(p.id)} />}</Route>
        <Route path="/lists" component={ListsPage} />
        <Route path="/lists/:id">{(p) => <ListPage key={p.id} id={num(p.id)} />}</Route>
        <Route path="/catalog" component={CatalogPage} />
        <Route path="/catalog/duplicates" component={DuplicatesPage} />
        <Route path="/catalog/:id">{(p) => <GroceryPage key={p.id} id={num(p.id)} />}</Route>
        <Route>
          <main className="wrap empty">
            Page not found. <Link href="/">Go to the weekly order</Link>
          </main>
        </Route>
      </Switch>
    </>
  );
}

export function App() {
  return (
    <DataProvider>
      <Routes />
      <ToastHost />
      <footer className="tabbar">
        <nav aria-label="Main">
          <Tab href="/" label="Order" icon="order" />
          <Tab href="/recipes" label="Recipes" icon="recipes" />
          <Tab href="/lists" label="Lists" icon="lists" />
          <Tab href="/catalog" label="Catalog" icon="catalog" />
        </nav>
      </footer>
    </DataProvider>
  );
}
