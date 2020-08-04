use std::fs;
use std::collections::HashSet;
use std::sync::{
    Mutex,
    Arc
};

#[macro_use]
extern crate log;

use structopt::StructOpt;

use actix::prelude::*;

use actix_web::{
    HttpResponse,
    HttpRequest,
    HttpServer,
    middleware,
    Error,
    web,
    App,
};

use actix_web_actors::ws;
use actix_files::Files;

mod sync_actor;
use sync_actor::SyncWebSocket;

#[derive(Clone, Debug)]
pub struct WindsweptState {
    pub data_path: &'static str,
    pub data_file: Arc<Mutex<fs::File>>,
    pub connections: Arc<Mutex<HashSet<Addr<SyncWebSocket>>>>
}

async fn ws_sync_ep(r: HttpRequest, stream: web::Payload,
    state: web::Data<WindsweptState>) -> Result<HttpResponse, Error> {
    info!("starting websocket actor: {:?}", r);
    ws::start(SyncWebSocket::new(state.into_inner()), &r, stream)
}

#[derive(StructOpt, Debug)]
#[structopt(
    name = "windswept-server",
    author = "William Light <windswept@wrl.lhiaudio.com>",
    about = "Backend server for the Windswept task management system"
)]
struct Arguments {
    #[structopt(name = "host", short = "-h", long = "--host")]
    host: Option<String>,

    #[structopt(name = "port", short = "-p", long = "--port")]
    port: Option<u16>,

    #[structopt(name = "data directory",
        help = "Directory for storing the synchronised JSON task state and backups")]
    data_dir: String
}

#[actix_rt::main]
async fn main() -> std::io::Result<()> {
    // env::set_var("RUST_LOG", "actix_web=info,windswept=info");
    env_logger::init();
    let mut args = Arguments::from_args();

    let f = {
        fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(format!("{}/windswept.json", args.data_dir))?
    };

    let data_path = {
        let mut replacement = String::new();
        std::mem::swap(&mut args.data_dir, &mut replacement);

        // leaking this to get 'static
        Box::leak(replacement.into_boxed_str())
    };

    let state = WindsweptState {
        data_path: data_path,
        data_file: Arc::new(Mutex::new(f)),
        connections: Arc::new(Mutex::new(HashSet::new()))
    };

    let server = HttpServer::new(move || {
        App::new()
            .data(state.clone())
            .wrap(middleware::Logger::default())
            .service(web::resource("/sync/").route(web::get().to(ws_sync_ep)))
            .service(Files::new("/", "./frontend/public").index_file("index.html"))
    });

    let addr = (
        args.host.as_deref().unwrap_or("127.0.0.1"),
        args.port.unwrap_or(8080)
    );

    server.bind(addr)?
        .run()
        .await
}
