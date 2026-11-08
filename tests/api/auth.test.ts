import { describe, expect, it } from "vitest";
import { setPassword } from "../../src/server/auth.ts";
import { setup } from "./helpers.ts";

describe("login", () => {
  it("rejects API calls without the cookie", async () => {
    const { app } = await setup();
    const res = await app.request("/api/recipes");
    expect(res.status).toBe(401);
  });

  it("sends pages without the cookie to the login page", async () => {
    const { app } = await setup();
    const res = await app.request("/recipes");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("serves the login page and the manifest without the cookie", async () => {
    const { app } = await setup();
    expect((await app.request("/login")).status).toBe(200);
    expect((await app.request("/manifest.webmanifest")).status).not.toBe(401);
  });

  it("rejects a wrong password", async () => {
    const { login } = await setup();
    const res = await login("wrong password");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("sets a long-lived cookie for the right password", async () => {
    const { login } = await setup();
    const res = await login();
    expect(res.status).toBe(302);
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toMatch(/Max-Age=34560000/);
  });

  it("lets a logged-in phone call the API", async () => {
    const { call } = await setup();
    expect((await call("GET", "/api/recipes")).status).toBe(200);
  });

  it("signs out every phone when the password changes", async () => {
    const { db, call } = await setup();
    setPassword(db, "a new password");
    expect((await call("GET", "/api/recipes")).status).toBe(401);
  });

  it("blocks an address after 10 wrong passwords", async () => {
    const { login } = await setup();
    for (let i = 0; i < 10; i++) await login("nope");
    expect((await login()).status).toBe(429);
  });

  it("asks for setup when no password is set", async () => {
    const { app } = await setup({ password: false });
    const page = await (await app.request("/login")).text();
    expect(page).toContain("npm run set-password");
  });
});
