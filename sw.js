const CACHE_NAME = "boss-tracker-v3";
const PRECACHE_URLS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "db.js",
  "manifest.json",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/bosses/manifest.json",
  "assets/bosses/ahrim-the-blighted.png",
  "assets/bosses/karil-the-tainted.png",
  "assets/bosses/dharok-the-wretched.png",
  "assets/bosses/guthan-the-infested.png",
  "assets/bosses/torag-the-corrupted.png",
  "assets/bosses/verac-the-defiled.png",
  "assets/bosses/gemstone-crab.png",
  "assets/bosses/scurrius.png",
  "assets/bosses/giant-mole.png",
  "assets/bosses/deranged-archaeologist.png",
  "assets/bosses/dagannoth-supreme.png",
  "assets/bosses/dagannoth-rex.png",
  "assets/bosses/dagannoth-prime.png",
  "assets/bosses/sarachnis.png",
  "assets/bosses/blood-moon.png",
  "assets/bosses/blue-moon.png",
  "assets/bosses/eclipse-moon.png",
  "assets/bosses/kalphite-queen.png",
  "assets/bosses/kree-arra.png",
  "assets/bosses/commander-zilyana.png",
  "assets/bosses/general-graardor.png",
  "assets/bosses/k-ril-tsutsaroth.png",
  "assets/bosses/the-hueycoatl.png",
  "assets/bosses/corporeal-beast.png",
  "assets/bosses/nex.png",
  "assets/bosses/chaos-fanatic.png",
  "assets/bosses/crazy-archaeologist.png",
  "assets/bosses/scorpia.png",
  "assets/bosses/king-black-dragon.png",
  "assets/bosses/chaos-elemental.png",
  "assets/bosses/revenant-maledictus.png",
  "assets/bosses/calvar-ion.png",
  "assets/bosses/vet-ion.png",
  "assets/bosses/spindel.png",
  "assets/bosses/venenatis.png",
  "assets/bosses/artio.png",
  "assets/bosses/callisto.png",
  "assets/bosses/brutus.png",
  "assets/bosses/obor.png",
  "assets/bosses/bryophyta.png",
  "assets/bosses/amoxliatl.png",
  "assets/bosses/royal-titans.png",
  "assets/bosses/doom-of-mokhaiotl.png",
  "assets/bosses/zulrah.png",
  "assets/bosses/vorkath.png",
  "assets/bosses/phantom-muspah.png",
  "assets/bosses/maggot-king.png",
  "assets/bosses/the-nightmare.png",
  "assets/bosses/yama.png",
  "assets/bosses/duke-sucellus.png",
  "assets/bosses/the-leviathan.png",
  "assets/bosses/the-whisperer.png",
  "assets/bosses/vardorvis.png",
  "assets/bosses/the-mimic.png",
  "assets/bosses/hespori.png",
  "assets/bosses/skotizo.png",
  "assets/bosses/shellbane-gryphon.png",
  "assets/bosses/grotesque-guardians.png",
  "assets/bosses/abyssal-sire.png",
  "assets/bosses/kraken.png",
  "assets/bosses/cerberus.png",
  "assets/bosses/araxxor.png",
  "assets/bosses/thermonuclear-smoke-devil.png",
  "assets/bosses/alchemical-hydra.png",
  "assets/bosses/crystalline-hunllef.png",
  "assets/bosses/corrupted-hunllef.png",
  "assets/bosses/tztok-jad.png",
  "assets/bosses/tzkal-zuk.png",
  "assets/bosses/sol-heredit.png",
  "assets/bosses/chambers-of-xeric.png",
  "assets/bosses/chambers-of-xeric-cm.png",
  "assets/bosses/theatre-of-blood.png",
  "assets/bosses/theatre-of-blood-hm.png",
  "assets/bosses/tombs-of-amascut.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && event.request.method === "GET") {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
