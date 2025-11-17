const RIVE_URL =
  "https://raw.githubusercontent.com/negtvozero-jpg/XmasLights/main/XmasLightsOverlay.riv";

let LAST_FIELDS = {};
let riveInstance = null;
window.XmasVM = null;
let currentFieldData = {};

function hexToRiveColor(hex) {
  if (!hex || typeof hex !== "string") return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const rgb = parseInt(m[1], 16);
  const argb = (0xff000000 | rgb) >>> 0;
  return argb;
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
  }

  if (globalVM.number && fieldData.idleSpeed) {
    const speedMap = { slow: 0, normal: 1, fast: 2 };
    const sIdx = speedMap[fieldData.idleSpeed] ?? 1;
    const prop = globalVM.number("IdleSpeed");
    if (prop) prop.value = sIdx;
  }

  if (globalVM.number && typeof fieldData.bulbBrightness === "number") {
    const v = Math.max(0, Math.min(100, fieldData.bulbBrightness)) / 100;
    const prop = globalVM.number("BulbBrightness");
    if (prop) prop.value = v;
  }

  if (globalVM.number && typeof fieldData.glowStrength === "number") {
    const v = Math.max(0, Math.min(100, fieldData.glowStrength)) / 100;
    const prop = globalVM.number("GlowStrength");
    if (prop) prop.value = v;
  }

  if (globalVM.color) {
    const cPrim = hexToRiveColor(fieldData.primaryColor);
    const cSec = hexToRiveColor(fieldData.secondaryColor);
    const cAcc = hexToRiveColor(fieldData.accentColor);

    if (cPrim != null) {
      const p = globalVM.color("ColorPrimary");
      if (p) p.value = cPrim;
    }
    if (cSec != null) {
      const p = globalVM.color("ColorSecondary");
      if (p) p.value = cSec;
    }
    if (cAcc != null) {
      const p = globalVM.color("ColorAccent");
      if (p) p.value = cAcc;
    }
  }

  applyBulbStyles(vmBundle, fieldData);
}

function resolveGiftCount(ev, defaultCount = 1) {
  const candidates = [
    ev.bulkGifted,
    ev.count,
    ev.quantity,
    ev.giftCount,
    ev.amount,
  ];

  for (const val of candidates) {
    if (val === undefined || val === null) continue;

    // número direto
    if (typeof val === "number") {
      if (!Number.isNaN(val) && val > 0) return val;
      continue;
    }

    // string só com dígitos ("10", "5", etc.)
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
    fields.giftBigThreshold || fields.giftThreshold || 10
  );

  switch (listener) {
    case "subscriber-latest": {
      const tier = String(ev.tier || ev.tier_raw || ev.plan || "")
        .toLowerCase()
        .trim();

      // DETECÇÃO DE GIFT
      const isGift =
        ev.gifted === true ||
        ev.isGift === true ||
        ev.is_gift === true ||
        ev.isCommunityGift === true ||
        ev.bulkGifted === true ||
        ev.is_mass_gift === true ||
        ev.gift === true ||
        ev.amount === "gift";

      if (isGift || ev.bulkGifted || ev.is_mass_gift) {
        // usa função robusta pra achar quantos subs tem essa gift
        const giftCount = resolveGiftCount(ev, 1);

        // big vs small
        type = giftCount >= bigGiftThreshold ? 4 : 3;
      } else {
        // NÃO é gift → sub normal por tier
        if (tier.includes("2000") || tier === "tier2") {
          type = 1; // T2
        } else if (tier.includes("3000") || tier === "tier3") {
          type = 2; // T3
        } else {
          type = 0; // T1 / Prime
        }
      }

      break;
    }

    case "tip-latest":
    case "donation-latest":
      type = 5;
      break;

    case "cheer-latest":
      type = 6;
      break;

    case "raid-latest":
      type = 7;
      break;

    case "follower-latest":
      type = 8;
      break;

    default:
      break;
  }

  return type;
}


function fireRiveAlert(vmBundle, eventType) {
  if (!eventType && eventType !== 0) return;

  let bundle = vmBundle;
  if (!bundle && riveInstance) {
    bundle = bindViewModels(riveInstance);
  }
  if (!bundle || !bundle.globalVM) return;

  const globalVM = bundle.globalVM;

  const typeProp =
    globalVM.number && typeof globalVM.number === "function"
      ? globalVM.number("EventType")
      : null;

  const triggerProp =
    globalVM.trigger && typeof globalVM.trigger === "function"
      ? globalVM.trigger("EventTrigger")
      : null;

  if (!typeProp || !triggerProp) return;

  typeProp.value = Number(eventType) || 0;

  if (typeof triggerProp.trigger === "function") {
    triggerProp.trigger();
  }
}

window.addEventListener("onWidgetLoad", (event) => {
  const canvas = document.getElementById("rive-canvas");
  if (!canvas) return;

  const fieldData = (event && event.detail && event.detail.fieldData) || {};
  LAST_FIELDS = fieldData;
  currentFieldData = fieldData;

  if (!window.rive) return;

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
      riveInstance.resizeDrawingSurfaceToCanvas();
      const vmBundle = bindViewModels(riveInstance);
      if (!vmBundle) return;
      applyFieldSettings(vmBundle, fieldData);
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

  const eventType = classifyEventType(listener, ev, fields);
  if (eventType == null) return;

  const vmBundle = window.XmasVM;
  fireRiveAlert(vmBundle, eventType);
});
