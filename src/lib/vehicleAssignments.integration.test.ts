import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, it } from "vitest";

it.skipIf(!process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON)("keeps one live assignment per vehicle, updates it in place and protects the set", async () => {
  const session = JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON || "{}");
  const config = readFileSync(`${process.cwd()}/.env`, "utf8");
  const value = (key: string) => {
    const match = config.match(new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m"));
    if (!match) throw new Error(`Missing ${key}`);
    return match[1];
  };
  const db = createClient(value("VITE_SUPABASE_URL"), value("VITE_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const ids: string[] = [];
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  try {
    const result = await db.from("vehicles").insert(["cavalo", "cavalo", "semirreboque"].map((category, i) => ({
      plate: `${["ZQA", "ZQB", "ZQC"][i]}${suffix}`, unit_category: category,
      vehicle_type: "carreta", brand: "Teste Temporario Integracao", model: "Validacao", year: 2026,
      renavam: "00000000001", fleet_type: "terceiros", user_id: session.user.id,
    }))).select("id,unit_category");
    if (result.error) throw new Error(result.error.message);
    ids.push(...result.data.map(v => v.id));

    const created = await db.rpc("save_vehicle_assignment", { _vehicle_id: ids[0], _implement_ids: [ids[2]] });
    if (created.error) throw new Error(created.error.message);
    const projected = await db.from("vehicles").select("trailer_plate_1").eq("id", ids[0]).single();
    expect(projected.data?.trailer_plate_1).toBe(`ZQC${suffix}`);

    const duplicate = await db.rpc("save_vehicle_assignment", { _vehicle_id: ids[1], _implement_ids: [ids[2]] });
    expect(duplicate.error?.message).toContain("outro conjunto");

    const invalidTraction = await db.rpc("save_vehicle_assignment", { _vehicle_id: ids[2] });
    expect(invalidTraction.error?.message).toContain("unidade de tração");

    const changedCategory = await db.from("vehicles").update({ unit_category: "rigido" }).eq("id", ids[0]);
    expect(changedCategory.error?.message).toContain("vinculação");

    // Replacing the set keeps a single record and updates it in place.
    const replaced = await db.rpc("save_vehicle_assignment", { _vehicle_id: ids[0], _implement_ids: [ids[2]], _previous_id: created.data, _notes: "Troca de conjunto" });
    if (replaced.error) throw new Error(replaced.error.message);
    expect(replaced.data).toBe(created.data);
    const live = await db.from("vehicle_assignments").select("id,notes").eq("vehicle_id", ids[0]);
    expect(live.data?.length).toBe(1);
    expect(live.data?.[0].notes).toBe("Troca de conjunto");

    // Removing the implement clears the projected plate of the same record.
    const clearedSet = await db.rpc("save_vehicle_assignment", { _vehicle_id: ids[0], _implement_ids: [], _previous_id: created.data });
    if (clearedSet.error) throw new Error(clearedSet.error.message);
    const cleared = await db.from("vehicles").select("trailer_plate_1").eq("id", ids[0]).single();
    expect(cleared.data?.trailer_plate_1).toBeNull();
    const stillOne = await db.from("vehicle_assignments").select("id").eq("vehicle_id", ids[0]);
    expect(stillOne.data?.length).toBe(1);

    // A stale record id no longer matches the plate and is refused.
    const stale = await db.rpc("save_vehicle_assignment", { _vehicle_id: ids[1], _previous_id: created.data });
    expect(stale.error?.message).toContain("Vinculação já alterada");
  } finally {
    // Deletion of assignments is intentionally service-role-only.
    // Remove these isolated temporary rows through the data administration tool after the test.
    if (ids.length) console.info("Temporary integration rows created; cleanup required.");
  }
}, 30000);
