use std::io::prelude::*;
use std::path::PathBuf;
use std::io::SeekFrom;
use std::sync::Arc;
use std::fs;

use std::time::{Duration, Instant};

use actix::prelude::*;
use actix_web_actors::ws;

use crate::WindsweptState;

#[derive(Clone, Debug, Message)]
#[rtype(return="()")]
struct SyncBroadcast(Arc<String>);

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug)]
pub struct SyncWebSocket {
    hb: Instant,
    state: Arc<WindsweptState>,
    address: Option<Addr<SyncWebSocket>>
}

type WsResult = Result<ws::Message, ws::ProtocolError>;

impl Actor for SyncWebSocket {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);

        let _ = self.send_data_file(ctx);

        let mut conns = self.state.connections.lock().unwrap();
        conns.insert(ctx.address());

        self.address = Some(ctx.address());
    }

    fn stopped(&mut self, ctx: &mut Self::Context) {
        let mut conns = self.state.connections.lock().unwrap();
        conns.remove(&ctx.address());
    }
}

impl StreamHandler<WsResult> for SyncWebSocket {
    fn handle(&mut self, msg: WsResult, ctx: &mut Self::Context) {
        use ws::Message;
        match msg {
            Ok(Message::Ping(msg)) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            },

            Ok(Message::Pong(_)) => self.hb = Instant::now(),

            Ok(ws::Message::Text(txt)) => {
                let _ = self.got_text(&*txt);
                self.broadcast_sync(txt);
            }

            Ok(ws::Message::Binary(bin)) => ctx.binary(bin),

            Ok(ws::Message::Close(_)) => ctx.stop(),
            _ => ctx.stop()
        }
    }
}

impl Handler<SyncBroadcast> for SyncWebSocket {
    type Result = ();

    fn handle(&mut self, msg: SyncBroadcast, ctx: &mut Self::Context) {
        ctx.text(&*msg.0);
    }
}

impl SyncWebSocket {
    pub fn new(state: Arc<WindsweptState>) -> Self {
        Self {
            hb: Instant::now(),
            state,
            address: None
        }
    }

    fn hb(&self, ctx: &mut <Self as Actor>::Context) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                ctx.stop();
                return
            }

            ctx.ping(b"");
        });
    }

    fn send_data_file(&mut self, ctx: &mut <Self as Actor>::Context)
            -> std::io::Result<()> {
        let mut f = self.state.data_file.lock().unwrap();

        f.seek(SeekFrom::Start(0))?;

        let mut s = String::new();
        f.read_to_string(&mut s)?;

        ctx.text(s);
        Ok(())
    }

    fn got_text(&mut self, txt: &str) -> std::io::Result<()> {
        if txt.starts_with("~!~") {
            return self.write_backup(&txt[3..]);
        }

        let mut f = self.state.data_file.lock().unwrap();

        f.seek(SeekFrom::Start(0))?;
        f.set_len(0)?;
        f.write(txt.as_bytes())?;

        Ok(())
    }

    fn broadcast_sync(&mut self, txt: String) {
        let conns = self.state.connections.lock().unwrap();

        let us = match self.address.as_ref() {
            Some(a) => a,
            _ => return
        };

        let msg = SyncBroadcast(Arc::new(txt));

        for c in conns.iter() {
            if c == us {
                continue
            }

            c.do_send(msg.clone());
        }
    }

    fn write_backup(&mut self, txt: &str) -> std::io::Result<()> {
        let basename = format!("backup-{}.json", chrono::Local::now().to_rfc3339());
        let p: PathBuf = [self.state.data_path, &*basename].iter().collect();

        let mut f = fs::File::create(p)?;
        f.write(txt.as_bytes())?;

        Ok(())
    }
}
