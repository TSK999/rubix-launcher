fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        embed_resource::compile("app.rc", embed_resource::NONE)
            .manifest_required()
            .expect("Windows application resources must compile");
    }
    println!("cargo:rerun-if-changed=app.rc");
    println!("cargo:rerun-if-changed=../../assets/rubix.ico");
}
