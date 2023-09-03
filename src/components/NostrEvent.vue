<script setup lang="ts">
import { ref } from "vue";
import * as Nostr from "nostr-tools";

const props = defineProps({
  event: {
    type: Object as () => {
      id: string;
      pubkey: string;
      kind: number;
      content: string;
      tags: string[][];
      created_at: number;
    },
    required: true,
  },
});

const showTags = ref(false);
switch (props.event.kind) {
  case 5:
  case 6:
  case 7:
    showTags.value = true;
    break;
  default:
    showTags.value = false;
    break;
}

const kindType = ref(new Map<number, string>());
kindType.value.set(0, "プロフィール (kind0)");
kindType.value.set(1, "投稿 (kind1)");
kindType.value.set(3, "フォローリスト(+リレーリスト) (kind3)");
kindType.value.set(10002, "リレーリスト (kind10002)");
kindType.value.set(4, "ダイレクトメッセージ (kind4)");
kindType.value.set(5, "イベント削除 (kind5)");
kindType.value.set(6, "リポスト (kind6)");
kindType.value.set(7, "リアクション (kind7)");
kindType.value.set(10000, "ミュートリスト (kind10000)");
kindType.value.set(10001, "ピン留め (kind10001)");
kindType.value.set(30000, "リスト(ミュート、ブロックなど) (kind30000)");
kindType.value.set(30001, "ブックマーク (kind30001)");

const showJSON = ref(false);
</script>

<template>
  <div class="event">
    <div class="header">
      <a :href="'https://relay-jp.nostr.wirednet.jp/index.html?' + Nostr.nip19.noteEncode(event.id)" target="_blank"
        >{{ new Date(event.created_at * 1000).toLocaleString() }} <span class="kind">{{ kindType.get(event.kind) || `(kind${event.kind})` }}</span></a
      >
    </div>
    <div class="content">{{ event.content }}</div>
    <div v-if="event.tags.length > 0 && !showTags" @click="showTags = true"><span class="show">&nbsp;▼&nbsp;Show Tags</span></div>
    <div v-if="event.tags.length > 0 && showTags" @click="showTags = false"><span class="show">&nbsp;▲&nbsp;Hide</span></div>
    <ul v-if="event.tags.length > 0 && showTags">
      <li v-for="(t, i) in event.tags" :key="i">
        <template v-if="t[0] === 'p'">
          ユーザー: <a :href="'https://relay-jp.nostr.wirednet.jp/index.html?' + Nostr.nip19.npubEncode(t[1])" target="_blank">{{ t[1] }}</a>
        </template>
        <template v-else-if="t[0] === 'e'">
          投稿: <a :href="'https://relay-jp.nostr.wirednet.jp/index.html?' + Nostr.nip19.noteEncode(t[1])" target="_blank">{{ t[1] }}</a>
        </template>
        <template v-else-if="t[0] === 'q'">
          引用: <a :href="t[1]" target="_blank">{{ t[1] }}</a>
        </template>
        <template v-else-if="t[0] === 'r'">
          リンク: <a :href="t[1]" target="_blank">{{ t[1] }}</a>
        </template>
        <template v-else>
          {{ JSON.stringify(t) }}
        </template>
      </li>
    </ul>

    <div>
      <div v-if="!showJSON" @click="showJSON = true"><span class="show">&nbsp;▼&nbsp;Show JSON</span></div>
      <div v-if="showJSON" @click="showJSON = false"><span class="show">&nbsp;▲&nbsp;Hide</span></div>
      <div class="json" v-if="showJSON">{{ JSON.stringify(event, undefined, 2) }}</div>
    </div>
  </div>
</template>

<style scoped>
.event {
  border: 1px solid lightgray;
  margin: 0.3em;
}

.header {
  margin: 0.5em;
}

.header a {
  color: black;
  text-decoration: underline;
}
.content {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
  color: 1px dashed lightgray;
  margin: 1em;
  font-size: 1.1em;
}

.show {
  font-size: 0.8em;
  margin: 0 1em;
}

ul {
  list-style-type: circle;
  border-bottom: 1px dashed lightgray;
  margin: 0 1em;
  font-size: 0.8em;
}

.json {
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-all;
  color: 1px dashed lightgray;
  margin: 0.5em 2em;
  font-size: 0.8em;
}
</style>
