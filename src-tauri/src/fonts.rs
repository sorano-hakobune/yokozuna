//! System font enumeration for the text tool.
//!
//! Add to Cargo.toml:
//!   fontdb = "0.16"
//!
//! Register in lib.rs / main.rs:
//!   .invoke_handler(tauri::generate_handler![
//!       // ...existing commands...
//!       fonts::list_system_fonts,
//!   ])
//!
//! And either `mod fonts;` or include the function directly.

use fontdb::Database;

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    let mut db = Database::new();
    db.load_system_fonts();

    let mut families: Vec<String> = db
        .faces()
        .filter_map(|face| {
            // Prefer the first (usually English / primary) family name
            face.families.first().map(|(name, _lang)| name.clone())
        })
        .collect();

    families.sort();
    families.dedup();
    families
}
