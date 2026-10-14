#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    clashmorden_lib::run().unwrap();
}
