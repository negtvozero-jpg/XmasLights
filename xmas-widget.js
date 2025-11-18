const RIVE_URL =
  "https://raw.githubusercontent.com/negtvozero-jpg/XmasLights/main/XmasLightsOverlay.riv";

let LAST_FIELDS = {};
let riveInstance = null;
window.XmasVM = null;
let currentFieldData = {};
let ENABLE_FOLLOW = true;
let ENABLE_SUB = true;
let ENABLE_SUB_T2 = true;
let ENABLE_SUB_T3 = true;
let ENABLE_GIFT_SMALL = true;
let ENABLE_GIFT_BIG = true;
let ENABLE_DONATION = true;
let ENABLE_BITS = true;
let ENABLE_RAID = true;
let MIN_DONATION = 0;
let MIN_BITS = 0;
let MIN_RAID = 0;
let GIFT_BIG_THRESHOLD = 10;
let QUEUE_ENABLED = true;
let QUEUE_MAX_SIZE = 20;
let alertQueue = [];
let isPlayingAlert = false;
const ALERT_FALLBACK_MS = 9000;
let alertEndTimeoutId = null;
let lastIsAlertOn = null;
let lastGiftBombSignature = null;
let lastGiftBombTime = 0;
let lastGiftBombWindowUntil = 0;
const EVENT_PRIORITY = {
  0: 40,
  1: 50,
  2: 60,
  3: 45,
  4: 80,
  5: 50,
  6: 40,
  7: 100,
  8: 10,
};

function getEventPriority(eventType) {
  return EVENT_PRIORITY[eventType] ?? 0;
}

function getEventLabel(eventType) {
  switch (eventType) {
    case 0: return "Sub";
    case 1: return "SubT2";
    case 2: return "SubT3";
    case 3: return "SmallGift";
    case 4: return "BigGift";
    case 5: return "Donation";
    case 6: return "Bits";
    case 7: return "Raid";
    case 8: return "Follower";
    default: return `Type${eventType}`;
  }
}

function hexToRiveColor(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const rgb = parseInt(m[1], 16);
  const argb = (0xff000000 | rgb) >>> 0;
  return argb;
}

function asBool(v, def = true) {
  if (v === undefined || v === null) return def;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if (["true", "on", "1", "yes"].includes(s)) return true;
    if (["false", "off", "0", "no"].includes(s)) return false;
  }
  return !!v;
}

function getFieldBool(fieldData, baseName, defaultVal = true) {
  if (!fieldData) return defaultVal;

  const candidates = [
    fieldData[baseName],
    fieldData[baseName && baseName.toLowerCase()],
    baseName
      ? fieldData[baseName.replace(/[A-Z]/g, (c) => c.toLowerCase())]
      : undefined,
    baseName
      ? fieldData[baseName.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())]
      : undefined,
    baseName
      ? fieldData[baseName.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())]
      : undefined,
  ];

  for (const v of candidates) {
    if (v !== undefined) return asBool(v, defaultVal);
  }
  return defaultVal;
}

function bindViewModels(instance) {
  const rootVM = instance.viewModelInstance;
  if (!rootVM || !rootVM.viewModel) return null;

  const bulbInstancesVM =
    rootVM.viewModel("Bulb instances") ||
    rootVM.viewModel("Bulb Instances") ||
    rootVM;

  let firstBulb =
    bulbInstancesVM.viewModel("Instance 1") ||
    bulbInstancesVM.viewModel("Ins1") ||
    null;

  if (
    !firstBulb &&
    bulbInstancesVM._viewModelInstances &&
    bulbInstancesVM._viewModelInstances.size
  ) {
    firstBulb = Array.from(bulbInstancesVM._viewModelInstances.values())[0];
  }

  let globalVM = null;
  if (firstBulb && firstBulb.viewModel) {
    globalVM =
      firstBulb.viewModel("property of Global") ||
      firstBulb.viewModel("Global") ||
      null;
  }

  let bulbVMs = [];
  if (
    bulbInstancesVM._viewModelInstances &&
    bulbInstancesVM._viewModelInstances.size
  ) {
    bulbVMs = Array.from(bulbInstancesVM._viewModelInstances.values());
  }

  const bundle = { rootVM, bulbInstancesVM, firstBulb, globalVM, bulbVMs };
  window.XmasVM = bundle;

  console.log("[XMAS] bindViewModels -> bundle:", bundle);
  return bundle;
}

function getAllBulbVMs(bulbInstancesVM) {
  const bulbs = [];
  if (bulbInstancesVM._viewModelInstances?.size) {
    bulbs.push(...bulbInstancesVM._viewModelInstances.values());
  }
  for (let i = 1; i <= 12; i++) {
    const byName = bulbInstancesVM.viewModel(`Instance ${i}`);
    if (byName && !bulbs.includes(byName)) bulbs.push(byName);
  }
  for (let i = 1; i <= 12; i++) {
    const alt = bulbInstancesVM.viewModel(`Ins${i}`);
    if (alt && !bulbs.includes(alt)) bulbs.push(alt);
  }
  return bulbs;
}

function applyStyleToBulb(bulbVM, style) {
  if (!bulbVM || typeof bulbVM.boolean !== "function") return;
  const styleToBool = {
    classic: "IsClassic",
    star: "IsStar",
    heart: "IsHeart",
    snowflake: "IsSnowflake",
    glerp: "IsGlerp",
    primary: "IsPrimary",
  };
  const target = styleToBool[style] || "IsClassic";
  const names = [
    "IsClassic",
    "IsStar",
    "IsHeart",
    "IsSnowflake",
    "IsGlerp",
    "IsPrimary",
  ];
  for (const n of names) {
    const p = bulbVM.boolean(n);
    if (p) p.value = n === target;
  }
}

function applyBulbStyles(vmBundle, fieldData) {
  const { bulbInstancesVM } = vmBundle;
  if (!bulbInstancesVM) return;

  const primaryStyle =
    fieldData.bulbStyleMain || fieldData.mainBulbStyle || "classic";
  const secondaryStyle =
    fieldData.bulbStyleAlt || fieldData.secondaryBulbStyle || "same";

  const bulbs = getAllBulbVMs(bulbInstancesVM);
  if (!bulbs.length) return;

  bulbs.forEach((bulb) => {
    let isPrimary = true;
    const p = bulb.boolean && bulb.boolean("IsPrimary");
    if (p && typeof p.value === "boolean") isPrimary = p.value;

    const style =
      secondaryStyle !== "same" && !isPrimary ? secondaryStyle : primaryStyle;
    applyStyleToBulb(bulb, style);
  });
}

function applyFieldSettings(vmBundle, fieldData) {
  if (!vmBundle || !vmBundle.globalVM) return;
  const globalVM = vmBundle.globalVM;

  const idleStyleMap = {
    breathingAlt: 0,
    breathingSync: 1,
    breathingWave: 2,
    twinkleRandom: 3,
    twinkleSync: 4,
    twinkleAlt: 5,
    "breathing-alternated": 0,
    "breathing-synchronised": 1,
    "breathing-synchronized": 1,
    "twinkle-random": 3,
    "twinkle-synchronised": 4,
    "twinkle-synchronized": 4,
    "twinkle-alternated": 5,
  };

  if (globalVM.number) {
    const rawIdleStyle = fieldData.idleStyle;
    let idx = 0;

    if (typeof rawIdleStyle === "number") {
      idx = rawIdleStyle;
    } else if (typeof rawIdleStyle === "string" && rawIdleStyle.trim() !== "") {
      const asNum = Number(rawIdleStyle);
      if (!Number.isNaN(asNum)) {
        idx = asNum;
      } else {
        idx = idleStyleMap[rawIdleStyle] ?? 0;
      }
    }

    const prop = globalVM.number("IdleStyle");
    if (prop) prop.value = idx;
    console.log("[XMAS] applyFieldSettings: IdleStyle idx =", idx);
  }

  if (globalVM.number && fieldData.idleSpeed) {
    const speedMap = { slow: 0, normal: 1, fast: 2 };
    const sIdx = speedMap[fieldData.idleSpeed] ?? 1;
    const prop = globalVM.number("IdleSpeed");
    if (prop) prop.value = sIdx;
    console.log("[XMAS] applyFieldSettings: IdleSpeed =", sIdx);
  }

  if (globalVM.number && typeof fieldData.bulbBrightness === "number") {
    const v = Math.max(0, Math.min(100, fieldData.bulbBrightness)) / 100;
    const prop = globalVM.number("BulbBrightness");
    if (prop) prop.value = v;
    console.log("[XMAS] applyFieldSettings: BulbBrightness =", v);
  }

  if (globalVM.number && typeof fieldData.glowStrength === "number") {
    const v = Math.max(0, Math.min(100, fieldData.glowStrength)) / 100;
    const prop = globalVM.number("GlowStrength");
    if (prop) prop.value = v;
    console.log("[XMAS] applyFieldSettings: GlowStrength =", v);
  }

  if (globalVM.color) {
    const cPrim = hexToRiveColor(fieldData.primaryColor);
    const cSec = hexToRiveColor(fieldData.secondaryColor);
    const cAcc = hexToRiveColor(fieldData.accentColor);

    const colorsDebug = {};
    if (cPrim != null) {
      const p = globalVM.color("ColorPrimary");
      if (p) p.value = cPrim;
      colorsDebug.cPrim = cPrim;
    }
    if (cSec != null) {
      const p = globalVM.color("ColorSecondary");
      if (p) p.value = cSec;
      colorsDebug.cSec = cSec;
    }
    if (cAcc != null) {
      const p = globalVM.color("ColorAccent");
      if (p) p.value = cAcc;
      colorsDebug.cAcc = cAcc;
    }
    console.log("[XMAS] applyFieldSettings: colors =", colorsDebug);
  }

  applyBulbStyles(vmBundle, fieldData);
}

function resolveGiftCount(ev, defaultCount = 1) {
  const candidates = [
    ev.giftCount,
    ev.bulkGifted,
    ev.count,
    ev.quantity,
    ev.giftCountAlt,
  ];

  for (const val of candidates) {
    if (val === undefined || val === null) continue;

    if (typeof val === "number") {
      if (!Number.isNaN(val) && val > 0) return val;
      continue;
    }

    if (typeof val === "string") {
      const m = val.match(/^\d+$/);
      if (m) {
        const n = parseInt(val, 10);
        if (n > 0) return n;
      }
    }
  }

  return defaultCount;
}

function classifyEventType(listener, ev, fields) {
  let type = null;

  const bigGiftThreshold = Number(
    GIFT_BIG_THRESHOLD ||
      fields.giftBigThreshold ||
      fields.giftThreshold ||
      10
  );

  switch (listener) {
    case "subscriber-latest": {
      const now = Date.now();

      if (now < lastGiftBombWindowUntil) {
        console.log(
          "[XMAS] classifyEventType: SUB após gift bomb dentro da janela, descartado"
        );
        return null;
      }

      const tier = String(ev.tier || ev.tier_raw || ev.plan || "")
        .toLowerCase()
        .trim();

      const rawGiftCount = resolveGiftCount(ev, 0);

      const giftBombKey =
        ev.giftBombKey || ev.giftnotify || ev.giftbombkey || null;

      const isBombFlag =
        ev.giftBomb === true ||
        ev.isGiftBomb === true ||
        ev.bulkGifted === true;

      const isBombSummary =
        isBombFlag || !!giftBombKey || rawGiftCount > 1;

      const isGiftedIndividual =
        (ev.gifted === true || ev.isGift === true || ev.is_gift === true) &&
        !isBombSummary;

      if (isGiftedIndividual) {
        console.log(
          "[XMAS] classifyEventType: sub gifted individual descartado (sem alerta)",
          ev
        );
        return null;
      }

      if (isBombSummary) {
        const signature = `${listener}|${giftBombKey || ""}|${rawGiftCount || 0}`;

        if (
          signature &&
          lastGiftBombSignature === signature &&
          now - lastGiftBombTime < 3000
        ) {
          console.log(
            "[XMAS] classifyEventType: gift bomb duplicado, ignorando",
            { listener, ev }
          );
          return null;
        }

        lastGiftBombSignature = signature;
        lastGiftBombTime = now;

        const giftCount = rawGiftCount > 0 ? rawGiftCount : 1;

        if (giftCount >= bigGiftThreshold) {
          if (!ENABLE_GIFT_BIG) return null;
          type = 4;
        } else {
          if (!ENABLE_GIFT_SMALL) return null;
          type = 3; 
        }

        lastGiftBombWindowUntil = now + 8000;

        console.log(
          "[XMAS] classifyEventType: MASS GIFT",
          giftCount,
          "-> type",
          type
        );
        break;
      }

      if (tier.includes("2000") || tier === "tier2") {
        if (!ENABLE_SUB_T2) return null;
        type = 1;
      } else if (tier.includes("3000") || tier === "tier3") {
        if (!ENABLE_SUB_T3) return null;
        type = 2;
      } else {
        if (!ENABLE_SUB) return null;
        type = 0;
      }

      console.log(
        "[XMAS] classifyEventType: SUB normal, tier=",
        tier || "T1/Prime",
        "-> type",
        type
      );
      break;
    }

    case "tip-latest":
    case "donation-latest": {
      const amount = Number(ev.amount || ev.amount_raw || 0);
      if (!ENABLE_DONATION) return null;
      if (amount < MIN_DONATION) return null;
      type = 5;
      console.log("[XMAS] classifyEventType: DONATION amount=", amount);
      break;
    }

    case "cheer-latest": {
      const bits = Number(ev.amount || ev.bits || 0);
      if (!ENABLE_BITS) return null;
      if (bits < MIN_BITS) return null;
      type = 6;
      console.log("[XMAS] classifyEventType: BITS =", bits);
      break;
    }

    case "raid-latest": {
      const viewers = Number(ev.amount || ev.viewers || 0);
      if (!ENABLE_RAID) return null;
      if (viewers < MIN_RAID) return null;
      type = 7;
      console.log("[XMAS] classifyEventType: RAID viewers=", viewers);
      break;
    }

    case "follower-latest":
      if (!ENABLE_FOLLOW) return null;
      type = 8;
      console.log("[XMAS] classifyEventType: FOLLOWER");
      break;

    default:
      console.log(
        "[XMAS] classifyEventType: listener não tratado, ignorando evento",
        listener
      );
      return null;
  }

  return type;
}

function fireRiveAlert(vmBundle, eventType, label) {
  if (!eventType && eventType !== 0) return;

  let bundle = vmBundle;
  if (!bundle && riveInstance) {
    bundle = bindViewModels(riveInstance);
  }
  if (!bundle || !bundle.globalVM) {
    console.warn("[XMAS] fireRiveAlert: sem globalVM");
    return;
  }

  const globalVM = bundle.globalVM;

  const typeProp =
    globalVM.number && typeof globalVM.number === "function"
      ? globalVM.number("EventType")
      : null;

  const triggerProp =
    globalVM.trigger && typeof globalVM.trigger === "function"
      ? globalVM.trigger("EventTrigger")
      : null;

  if (!typeProp || !triggerProp) {
    console.warn(
      "[XMAS] fireRiveAlert: inputs EventType/EventTrigger não encontrados"
    );
    return;
  }

  typeProp.value = Number(eventType) || 0;
  if (typeof triggerProp.trigger === "function") {
    console.log(
      "[XMAS] fireRiveAlert: disparando eventType =",
      eventType,
      "label =",
      label || getEventLabel(eventType)
    );
    triggerProp.trigger();
  }
}

function enqueueAlert(eventType, label) {
  if (!QUEUE_ENABLED) {
    fireRiveAlert(null, eventType, label);
    return;
  }

  const priority = getEventPriority(eventType);
  const alert = { eventType, priority, label: label || getEventLabel(eventType) };

  if (alertQueue.length < QUEUE_MAX_SIZE) {
    alertQueue.push(alert);
    console.log("[XMAS] enqueueAlert: ENFILEIRADO", alert);
    return;
  }

  let lowestIndex = 0;
  let lowestPriority = alertQueue[0].priority;

  for (let i = 1; i < alertQueue.length; i++) {
    if (alertQueue[i].priority < lowestPriority) {
      lowestPriority = alertQueue[i].priority;
      lowestIndex = i;
    }
  }

  if (priority <= lowestPriority) {
    console.log(
      "[XMAS] enqueueAlert: DESCARTADO novo alerta (prioridade menor ou igual)",
      alert
    );
    return;
  }

  console.log(
    "[XMAS] enqueueAlert: descartando alerta menos importante, index=",
    lowestIndex,
    "->",
    alertQueue[lowestIndex]
  );
  alertQueue.splice(lowestIndex, 1);
  alertQueue.push(alert);
}

function endCurrentAlert(reason) {
  if (!isPlayingAlert) return;

  if (alertEndTimeoutId) {
    clearTimeout(alertEndTimeoutId);
    alertEndTimeoutId = null;
  }

  console.log("[XMAS] endCurrentAlert: motivo =", reason, "queueLength:", alertQueue.length);

  setTimeout(() => {
    isPlayingAlert = false;
    processAlertQueue();
  }, 80);
}

function processAlertQueue() {
  console.log("[XMAS] processAlertQueue: chamado", {
    isPlayingAlert,
    queueLength: alertQueue.length,
  });

  if (!QUEUE_ENABLED) return;
  if (isPlayingAlert) return;
  if (alertQueue.length === 0) return;

  const next = alertQueue.shift();
  isPlayingAlert = true;

  console.log("[XMAS] processAlertQueue: TOCANDO alerta", {
    eventType: next.eventType,
    label: next.label,
    filaRestante: alertQueue.length,
  });

  fireRiveAlert(null, next.eventType, next.label);

  if (alertEndTimeoutId) {
    clearTimeout(alertEndTimeoutId);
    alertEndTimeoutId = null;
  }

  alertEndTimeoutId = setTimeout(() => {
    console.warn(
      "[XMAS] ALERT_FALLBACK: timeout, IsAlertOn não voltou pra false (último =",
      lastIsAlertOn,
      ")"
    );
    endCurrentAlert("fallback_timeout");
  }, ALERT_FALLBACK_MS);
}

function pollIsAlertOn() {
  const bundle = window.XmasVM;
  if (!bundle || !bundle.globalVM || !bundle.globalVM.boolean) return;

  const prop = bundle.globalVM.boolean("IsAlertOn");
  if (!prop) return;

  const v = !!prop.value;
  if (lastIsAlertOn === null) {
    lastIsAlertOn = v;
    return;
  }

  if (v !== lastIsAlertOn) {
    console.log("[XMAS] pollIsAlertOn: IsAlertOn mudou", {
      de: lastIsAlertOn,
      para: v,
    });

    if (lastIsAlertOn === true && v === false && isPlayingAlert) {
      console.log(
        "[XMAS] onAlertFinished: IsAlertOn true -> false = fim de alerta"
      );
      endCurrentAlert("IsAlertOn_false");
    }

    lastIsAlertOn = v;
  }
}

window.addEventListener("onWidgetLoad", (event) => {
  const canvas = document.getElementById("rive-canvas");
  if (!canvas) {
    console.error("[XMAS] onWidgetLoad: canvas #rive-canvas não encontrado");
    return;
  }

  const fieldData = (event && event.detail && event.detail.fieldData) || {};
  LAST_FIELDS = fieldData;
  currentFieldData = fieldData;

  console.log("[XMAS] onWidgetLoad: fieldData =", fieldData);

  ENABLE_FOLLOW     = getFieldBool(fieldData, "enableFollow", true);
  ENABLE_SUB        = getFieldBool(fieldData, "enableSub", true);
  ENABLE_SUB_T2     = getFieldBool(fieldData, "enableSubT2", true);
  ENABLE_SUB_T3     = getFieldBool(fieldData, "enableSubT3", true);
  ENABLE_GIFT_SMALL = getFieldBool(fieldData, "enableGiftSmall", true);
  ENABLE_GIFT_BIG   = getFieldBool(fieldData, "enableGiftBig", true);
  ENABLE_DONATION   = getFieldBool(fieldData, "enableDonation", true);
  ENABLE_BITS       = getFieldBool(fieldData, "enableBits", true);
  ENABLE_RAID       = getFieldBool(fieldData, "enableRaid", true);

  QUEUE_ENABLED = getFieldBool(fieldData, "enableAlertQueue", true);
  QUEUE_MAX_SIZE = Number(fieldData.queueMaxSize ?? 20) || 20;

  MIN_DONATION = Number(fieldData.minDonation ?? 0) || 0;
  MIN_BITS     = Number(fieldData.minBits ?? 0) || 0;
  MIN_RAID     = Number(fieldData.minRaid ?? 0) || 0;
  GIFT_BIG_THRESHOLD =
    Number(fieldData.giftBigThreshold ?? fieldData.giftThreshold ?? 10) || 10;

  console.log("[XMAS] onWidgetLoad: flags =", {
    ENABLE_FOLLOW,
    ENABLE_SUB,
    ENABLE_SUB_T2,
    ENABLE_SUB_T3,
    ENABLE_GIFT_SMALL,
    ENABLE_GIFT_BIG,
    ENABLE_DONATION,
    ENABLE_BITS,
    ENABLE_RAID,
    QUEUE_ENABLED,
    QUEUE_MAX_SIZE,
    MIN_DONATION,
    MIN_BITS,
    MIN_RAID,
    GIFT_BIG_THRESHOLD,
  });

  alertQueue = [];
  isPlayingAlert = false;
  if (alertEndTimeoutId) {
    clearTimeout(alertEndTimeoutId);
    alertEndTimeoutId = null;
  }

  if (!window.rive) {
    console.error("[XMAS] onWidgetLoad: window.rive não disponível");
    return;
  }

  riveInstance = new rive.Rive({
    src: RIVE_URL,
    canvas,
    autoplay: false,
    stateMachines: ["StateMachine1", "BulbSM"],
    layout: new rive.Layout({
      fit: rive.Fit.FitWidth,
      alignment: rive.Alignment.TopLeft,
    }),
    autoBind: true,
    onLoad: () => {
      console.log("[XMAS] Rive onLoad chamado");
      riveInstance.resizeDrawingSurfaceToCanvas();
      const vmBundle = bindViewModels(riveInstance);
      if (!vmBundle) return;

      applyFieldSettings(vmBundle, fieldData);

      lastIsAlertOn = null;
      setInterval(pollIsAlertOn, 120);

      riveInstance.play();
    },
  });
});

window.addEventListener("resize", () => {
  if (riveInstance) {
    riveInstance.resizeDrawingSurfaceToCanvas();
  }
});

window.addEventListener("onEventReceived", (e) => {
  const payload = e.detail;
  if (!payload) return;

  const listener = payload.listener;
  const ev = payload.event || payload.data || {};
  const fields = LAST_FIELDS || {};

  console.log("[XMAS] onEventReceived:", { listener, ev });

  const eventType = classifyEventType(listener, ev, fields);
  if (eventType == null) {
    return;
  }

  const label = getEventLabel(eventType);

  enqueueAlert(eventType, label);
  processAlertQueue();
});
