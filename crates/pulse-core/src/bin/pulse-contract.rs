fn main() {
    let root = std::env::args()
        .nth(1)
        .unwrap_or_else(|| ".".into());
    match pulse_core::contract::check_workspace(&root) {
        Ok(report) if report.ok => {
            println!("ok");
        }
        Ok(report) => {
            for error in report.errors {
                eprintln!("{error}");
            }
            std::process::exit(1);
        }
        Err(error) => {
            eprintln!("{error}");
            std::process::exit(1);
        }
    }
}
