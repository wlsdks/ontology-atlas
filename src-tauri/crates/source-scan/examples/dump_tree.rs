use source_scan::{parse_bounded, ParseLimits, SourceLanguage};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let text = std::fs::read_to_string(&args[2]).unwrap();
    let language = SourceLanguage::of_extension(&args[1]).unwrap();
    let parsed = parse_bounded(language, &text, ParseLimits::for_imports(1 << 22)).unwrap();
    println!("{}", parsed.root().to_sexp());
}
