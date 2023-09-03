<script setup lang="ts">
import { ref, type Ref } from "vue";
import * as Nostr from "nostr-tools";
import { RelayPool } from "nostr-relaypool";
import { NostrFetcher } from "nostr-fetch";
import { AccordionList, AccordionItem } from "vue3-rich-accordion";

import NostrEvent from "./components/NostrEvent.vue";

let logMessages = ref("");

const original_console_log = console.log;
console.log = (...args) => {
  args.forEach((a) => {
    original_console_log(a);
    logMessages.value += `${a}\n`;
  });
};

let pubkey = ref("");
const initRelays = [
  "wss://nos.lol/",
  "wss://nostr-pub.wellorder.net/",
  "wss://nostr-relay.nokotaro.com/",
  "wss://nostr.fediverse.jp",
  "wss://nostr.holybea.com/",
  "wss://nrelay-jp.c-stellar.net",
  "wss://nrelay.c-stellar.net",
  "wss://offchain.pub/",
  "wss://r.kojira.io/",
  "wss://relay-jp.nostr.wirednet.jp/",
  "wss://relay.current.fyi/",
  "wss://relay.damus.io/",
  "wss://relay.nostr.band/",
  "wss://relay.nostr.wirednet.jp/",
  "wss://relay.snort.social/",
  "wss://yabu.me/",
];

let userRelays: string[] = [];

function normalizeUrls(urls: string[]): string[] {
  return urls.map((url) => Nostr.utils.normalizeURL(url));
}

function main() {
  let pk = "";
  if (pubkey.value.startsWith("n")) {
    try {
      const d = Nostr.nip19.decode(pubkey.value);
      switch (d.type) {
        case "nprofile":
          pk = d.data.pubkey;
          break;
        case "npub":
          pk = d.data;
          break;
      }
    } catch (err) {
      console.log(err);
    }
  } else {
    pk = pubkey.value;
  }

  collectUserRelays(pk);
}

async function collectUserRelays(pubkey: string): Promise<void> {
  console.log(`ユーザーが利用しているリレーリストの取得を開始します`);

  const pool = new RelayPool(normalizeUrls(initRelays), {
    autoReconnect: true,
    logErrorsAndNotices: true,
    subscriptionCache: true,
    useEventCache: true,
  });

  let collectUserRelaysTimeout = setTimeout(() => {
    console.log(`リレーリストが見つかりませんでした`);
    collectUserEventsRange(pubkey);
  }, 3000);
  pool.subscribe(
    [
      {
        kinds: [3, 10002],
        authors: [pubkey],
      },
    ],
    [...new Set(normalizeUrls([...initRelays]))],
    (ev, _isAfterEose, relayURL) => {
      if (ev.kind === 3 && ev.content) {
        const content = JSON.parse(ev.content);
        for (const r in content) {
          userRelays.push(r);
        }

        console.log(`${relayURL} から ${new Date(ev.created_at * 1000).toLocaleString()} 時点のリレーリストを受信しました`);
        console.log(JSON.stringify(userRelays));
      } else if (ev.kind === 10002) {
        for (let i = 0; i < ev.tags.length; ++i) {
          const t = ev.tags[i];
          if (t[0] === "r") {
            const r = t[1];
            userRelays.push(r);
          }
        }
      }
      clearTimeout(collectUserRelaysTimeout);
      collectUserRelaysTimeout = setTimeout(() => {
        console.log(`リレーリストの取得が完了しました`);
        collectUserEventsRange(pubkey);
      }, 3000);
    },
    undefined,
    undefined,
    { unsubscribeOnEose: true },
  );
}

async function collectUserEventsRange(pubkey: string, relays: string[] = userRelays) {
  const findRelays = [...new Set(normalizeUrls([...relays, ...initRelays]))];

  console.log(`以下のリレーから投稿を探索します`);
  console.log(JSON.stringify(findRelays));
  console.log(JSON.stringify({ since: Math.floor(since.value.getTime() / 1000), until: Math.floor(until.value.getTime() / 1000) }));
  const fetcher = NostrFetcher.init();
  const eventsIter = fetcher.allEventsIterator(findRelays, { authors: [pubkey] }, { since: Math.floor(since.value.getTime() / 1000), until: Math.floor(until.value.getTime() / 1000) }, { enableBackpressure: true });

  for await (const ev of eventsIter) {
    addEvent(ev);
    if (syncStatus === true) {
      await publishEvent(ev);
    }
  }

  await Promise.all(promises);
  fetcher.shutdown();
  console.log(`全投稿の取得が完了しました`);
}

const events: Ref<Map<number, Map<number, Map<number, Nostr.Event[]>>>> = ref(new Map());
function addEvent(ev: Nostr.Event) {
  const evDate = new Date(ev.created_at * 1000);

  const year = evDate.getFullYear();
  const month = evDate.getMonth();
  const date = evDate.getDate();

  if (!events.value.has(year)) {
    events.value.set(year, new Map());
  }
  if (!events.value.get(year)?.has(month)) {
    events.value.get(year)?.set(month, new Map());
  }
  if (!events.value.get(year)?.get(month)?.has(date)) {
    events.value.get(year)?.get(month)?.set(date, []);
  }

  events.value
    .get(year)
    ?.get(month)
    ?.set(date, Nostr.utils.insertEventIntoAscendingList(events.value.get(year)?.get(month)?.get(date) as Nostr.Event[], ev));
}

function mapToObj(map: any): any {
  let obj = Object.create(null);
  for (let [key, value] of map) {
    if (value instanceof Map) {
      obj[key] = mapToObj(value);
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

function countNestedElements(map: any): number {
  let count = 0;
  for (let value of map.values()) {
    if (value instanceof Map) {
      count += countNestedElements(value as any);
    } else if (Array.isArray(value)) {
      count += value.length;
    }
  }
  return count;
}

let destRelayUrl = ref("");
let dstSocket: WebSocket;
let syncStatus = false;
let syncButtonStatus = ref(false);
let syncButtonTitle = ref("同期開始");

let receivedEvents = ref(0);
let ackedEvents = ref(0);
let duplicatedEvents = ref(0);
let nonDuplicatedEvents = ref(0);

const maxQueueLength = 20;
const resolveResponseMap = new Map<string, (value?: void) => void>();
let promises: Promise<void>[] = [];

function beginSyncDestRelay() {
  console.log("beginSyncDestRelay");
  if (destRelayUrl.value) {
    syncButtonStatus.value = true;
    syncButtonTitle.value = "同期中";
    syncStatus = true;
    dstSocket = new WebSocket(destRelayUrl.value);

    dstSocket.onmessage = (message) => {
      const ev = JSON.parse(message.data);
      ++ackedEvents.value;
      if (ev[0] === "OK") {
        const id = ev[1];
        if ((ev[3] as string).includes("duplicate:")) {
          ++duplicatedEvents.value;
        } else {
          ++nonDuplicatedEvents.value;
        }

        const resolveResponse = resolveResponseMap.get(id);
        if (resolveResponse) {
          resolveResponse();
          resolveResponseMap.delete(id);
        }
      }
    };

    dstSocket.onopen = () => {
      publishEventsInMap(events.value);
    };
  }
}
function stopSyncDestRelay() {
  console.log("stopSyncDestRelay");
  syncButtonStatus.value = false;
  syncButtonTitle.value = "同期開始";
  syncStatus = false;
}

async function publishEvent(ev: Nostr.Event) {
  if (promises.length > maxQueueLength) {
    await Promise.race(promises);
  }

  ++receivedEvents.value;

  const event_json = JSON.stringify(["EVENT", ev]);

  const responseReceived = new Promise<void>((resolve) => {
    resolveResponseMap.set(ev.id, resolve);
  });
  responseReceived.then(() => {
    const index = promises.indexOf(responseReceived);
    if (index > -1) {
      promises.splice(index, 1);
    }
  });

  dstSocket.send(event_json);
  promises.push(responseReceived);
}
async function publishEventsInMap(map: any) {
  for (let value of map.values()) {
    if (value instanceof Map) {
      await publishEventsInMap(value);
    } else if (value instanceof Array) {
      for (let i = 0; i < value.length; ++i) {
        await publishEvent(value[i]);
      }
    }
  }
}

const since = ref(new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000));
const until = ref(new Date(new Date().getTime()));
function dateFormat(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
</script>

<template>
  <h1>nostrlogs</h1>
  <form>
    <fieldset>
      <label for="pubkey">Nostr 公開鍵 (HEX形式またはnpub形式)</label>:<br />
      <input type="text" id="pubkey" title="Public key string (in HEX/npub)" size="96" v-model="pubkey" />
      <input type="button" value="取得" @click="main()" />

      <br />
      <label for="since">since</label>:
      <VueDatePicker placeholder="ここをクリックして日時を入力" v-model="since" :format="dateFormat(since)" locale="jp">
        <template #year="{ year }"> {{ year }}年 </template>
      </VueDatePicker>
      <br />
      <label for="until">until</label>:
      <VueDatePicker placeholder="ここをクリックして日時を入力" v-model="until" :format="dateFormat(until)" locale="jp">
        <template #year="{ year }"> {{ year }}年 </template>
      </VueDatePicker>
    </fieldset>
    <fieldset>
      <label for="destRelay">過去ログの同期先リレーサーバー (wss://形式)</label>:
      <input type="text" id="destRelay" title="Nostr relay server URL" size="96" list="relayList" v-model="destRelayUrl" />
      <input type="button" :value="syncButtonTitle" @click="beginSyncDestRelay()" :disabled="!destRelayUrl || syncButtonStatus" />
      <input type="button" value="同期停止" @click="stopSyncDestRelay()" :disabled="!destRelayUrl" v-if="syncButtonStatus" />
    </fieldset>
  </form>
  <hr />
  <div>
    取得済みイベント数 = {{ countNestedElements(events) }} ackedEvents = {{ ackedEvents }} duplicatedEvents = {{ duplicatedEvents }} nonDuplicatedEvents = {{ nonDuplicatedEvents }}

    <AccordionList v-for="(yearData, year) in mapToObj(events)" :key="'year-' + year" :open-multiple-items="true">
      <AccordionItem default-opened>
        <template #summary>{{ year }}</template>
        <AccordionList v-for="(monthData, month) in yearData" :key="'month-' + month" :open-multiple-items="true">
          <AccordionItem default-opened>
            <template #summary>{{ year }}/{{ parseInt("" + month) + 1 }}</template>
            <AccordionList :open-multiple-items="true">
              <AccordionItem v-for="(dateData, date) in monthData" :key="'date-' + date">
                <template #summary>{{ year }}/{{ parseInt("" + month) + 1 }}/{{ date }}</template>
                <div class="event" v-for="(e, index) in dateData" :key="'event-' + index">
                  <NostrEvent :event="e"></NostrEvent>
                </div>
              </AccordionItem>
            </AccordionList>
          </AccordionItem>
        </AccordionList>
      </AccordionItem>
    </AccordionList>
  </div>
  <datalist id="relayList">
    <option value="wss://nos.lol/"></option>
    <option value="wss://nostr-pub.wellorder.net/"></option>
    <option value="wss://nostr-relay-test.nokotaro.work/"></option>
    <option value="wss://nostr-relay.nokotaro.com/"></option>
    <option value="wss://nostr.fediverse.jp/"></option>
    <option value="wss://nostr.holybea.com/"></option>
    <option value="wss://nostr.mom/"></option>
    <option value="wss://nrelay-jp.c-stellar.net/"></option>
    <option value="wss://nrelay.c-stellar.net/"></option>
    <option value="wss://offchain.pub/"></option>
    <option value="wss://r.kojira.io/"></option>
    <option value="wss://relay-jp.nostr.wirednet.jp/"></option>
    <option value="wss://relay-jp.shino3.net/"></option>
    <option value="wss://relay.current.fyi/"></option>
    <option value="wss://relay.damus.io/"></option>
    <option value="wss://relay.mostr.pub/"></option>
    <option value="wss://relay.nostr.band/"></option>
    <option value="wss://relay.nostr.wirednet.jp/"></option>
    <option value="wss://relay.snort.social/"></option>
    <option value="wss://yabu.me/"></option>
  </datalist>
  <hr />
  <h2>Debug Log</h2>
  <pre>{{ logMessages }}</pre>
</template>

<style scoped>
pre {
  white-space: pre-wrap;
}

input[type="text"] {
  width: 80%;
  padding: 6px;
  font-size: 1.1em;
}

input[type="button"] {
  padding: 4px;
}

:root {
  font-family: "IBM Plex Mono", "Yusei Magic", monospace;
}
</style>
