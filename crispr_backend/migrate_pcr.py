import sqlite3
import json
from auth.supabase_client import get_supabase_admin

DB_PATH = "data/pcr_presets.db"

def migrate():
    supabase = get_supabase_admin()
    
    # 1. Get the first user ID (assuming it's the main user)
    user_res = supabase.table("users").select("id").limit(1).execute()
    if not user_res.data:
        print("No user found in Supabase to assign presets to.")
        return
    user_id = user_res.data[0]["id"]
    print(f"Migrating presets to User ID: {user_id}")

    # 2. Connect to old SQLite
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    presets = cursor.execute("SELECT * FROM pcr_presets").fetchall()
    
    for p in presets:
        p_dict = dict(p)
        print(f"Migrating preset: {p_dict['name']}")
        
        # Insert into Supabase pcr_presets
        # If it was a default preset in SQLite, we can make it a system preset or just a personal one.
        # Let's make them all personal presets for the user.
        res = supabase.table("pcr_presets").insert({
            "name": p_dict["name"],
            "category": p_dict["category"],
            "source": p_dict["source"],
            "description": p_dict["description"],
            "default_reaction_volume": p_dict["default_reaction_volume"],
            "allowed_reaction_volumes": json.loads(p_dict["allowed_reaction_volumes"] or "[]"),
            "is_system": bool(p_dict["is_default"]),
            "owner_user_id": user_id if not p_dict["is_default"] else None
        }).execute()
        
        if not res.data:
            print(f"Failed to migrate preset header: {p_dict['name']}")
            continue
            
        new_preset_id = res.data[0]["id"]
        
        # Get components
        comps = cursor.execute("SELECT * FROM pcr_preset_components WHERE preset_id = ?", (p_dict["id"],)).fetchall()
        supabase_comps = []
        for c in comps:
            c_dict = dict(c)
            supabase_comps.append({
                "preset_id": new_preset_id,
                "name": c_dict["name"],
                "component_type": c_dict["component_type"],
                "calculation_mode": c_dict["calculation_mode"],
                "stock_concentration": c_dict["stock_concentration"],
                "stock_unit": c_dict["stock_unit"],
                "final_concentration": c_dict["final_concentration"],
                "final_unit": c_dict["final_unit"],
                "fixed_volume": c_dict["fixed_volume"],
                "volume_per_25ul": c_dict["volume_per_25ul"],
                "ratio_denominator": c_dict["ratio_denominator"],
                "include_in_master_mix": bool(c_dict["include_in_master_mix"]),
                "is_optional": bool(c_dict["is_optional"]),
                "display_order": c_dict["display_order"]
            })
        
        if supabase_comps:
            supabase.table("pcr_preset_components").insert(supabase_comps).execute()
            print(f"  - Migrated {len(supabase_comps)} components.")

    conn.close()
    print("Migration complete!")

if __name__ == "__main__":
    migrate()
