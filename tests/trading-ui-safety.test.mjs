import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("NEAR wallet connector requires Testnet message-signing and transaction capabilities", () => {
  assert.match(app, /new NearConnector\(\{ network:'testnet', features:\{ testnet:true, signAndSendTransaction:true, signMessage:true \}/);
  assert.match(app, /wallet\.signMessage\(/);
  assert.match(app, /wallet\.signAndSendTransaction\(/);
});

test("submitted Tidepool intent stays locked while settlement is pending", () => {
  assert.match(app, /let intentSubmitted = false;/);
  assert.match(app, /terminalSettlement = \['SUCCESS', 'REFUNDED', 'FAILED'\]\.includes\(finalStatus\)/);
  assert.match(app, /liveButton\.disabled = intentSubmitted && !terminalSettlement/);
  assert.match(app, /Swap submitted · status pending/);
});

test("only a provider-reported SUCCESS is described as settlement confirmation", () => {
  assert.match(app, /finalStatus === 'SUCCESS' \? ' · settlement confirmed by Tidepool status'/);
});
