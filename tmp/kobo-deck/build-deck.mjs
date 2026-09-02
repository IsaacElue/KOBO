import fs from "node:fs/promises";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const OUT = "C:/Users/Isaac/Desktop/KOBO/KOBO_Hackathon_Demo_Deck.pptx";
const TMP = "C:/Users/Isaac/Desktop/KOBO/tmp/kobo-deck";
const W = 1280;
const H = 720;
const C = {
  ink: "#0C0D0C",
  paper: "#F5F4EE",
  acid: "#C8FF3D",
  muted: "#A9AAA1",
  soft: "#D9D9D0",
  green: "#1E5A40",
  white: "#FFFFFF",
  red: "#E84937",
};

async function writeBlob(path, blob) {
  await fs.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

function box(slide, x, y, w, h, fill, radius = 0, line = "none") {
  return slide.shapes.add({
    geometry: radius ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: line, width: line === "none" ? 0 : 1 },
    ...(radius ? { borderRadius: radius } : {}),
  });
}

function text(slide, value, x, y, w, h, size, color, bold = false, align = "left") {
  const s = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  s.text = value;
  s.text.style = { fontFace: "Arial", fontSize: size, bold, color, alignment: align };
  return s;
}

function line(slide, x1, y1, x2, y2, color, width = 2) {
  return slide.shapes.add({
    geometry: "line",
    position: { left: x1, top: y1, width: x2 - x1, height: y2 - y1 },
    fill: "none",
    line: { style: "solid", fill: color, width },
  });
}

function header(slide, n, label, dark = false) {
  const c = dark ? C.paper : C.ink;
  text(slide, "KOBO", 64, 35, 180, 26, 16, c, true);
  text(slide, String(n).padStart(2, "0"), 1158, 35, 58, 26, 16, c, true, "right");
  line(slide, 64, 72, 1216, 72, dark ? "#3B3C38" : C.soft, 1);
  if (label) text(slide, label.toUpperCase(), 64, 88, 360, 22, 12, dark ? C.acid : C.green, true);
}

function notes(slide, body, sources = []) {
  const sourceBlock = sources.length ? `\n\n[Sources]\n${sources.map((s) => `- ${s}`).join("\n")}` : "";
  slide.speakerNotes.textFrame.setText(body + sourceBlock);
  slide.speakerNotes.setVisible(true);
}

function addArrow(slide, x, y, w, label, dark = false) {
  box(slide, x, y, w, 70, dark ? "#232421" : C.white, 16, dark ? "#51534C" : C.soft);
  text(slide, label, x + 15, y + 22, w - 30, 26, 18, dark ? C.paper : C.ink, true, "center");
}

async function main() {
  await fs.mkdir(TMP, { recursive: true });
  const p = Presentation.create({ slideSize: { width: W, height: H } });

  // 1. The hook
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    text(s, "KOBO", 64, 44, 180, 28, 16, C.paper, true);
    text(s, "Ireland → Nigeria", 1000, 44, 216, 28, 16, C.acid, true, "right");
    text(s, "Sending money home\nshouldn't cost you\npeace of mind.", 64, 142, 720, 244, 64, C.paper, true);
    text(s, "A person sends €500. The point is not the transfer.\nIt's who is waiting on the other side.", 68, 422, 610, 62, 22, C.muted, false);
    box(s, 810, 154, 342, 364, "#20211E", 28, "#43453F");
    text(s, "€500", 850, 206, 260, 66, 56, C.paper, true, "center");
    line(s, 875, 309, 1085, 309, C.red, 3);
    text(s, "fees  ·  FX  ·  waiting", 848, 332, 268, 30, 18, C.red, true, "center");
    line(s, 875, 391, 1085, 391, C.acid, 3);
    text(s, "KOBO → family", 845, 414, 274, 32, 21, C.acid, true, "center");
    text(s, "Better rails. A simpler experience.", 64, 624, 610, 28, 18, C.acid, true);
    notes(s, "Open with the human moment. Someone in Ireland is trying to support a person they love in Nigeria. That should feel certain and simple - but today, the journey can take money, time and confidence out of every send. Kobo starts with that feeling, not with crypto.");
  }

  // 2. Problem
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 2, "The problem");
    text(s, "The money moves.\nThe friction doesn't.", 64, 144, 690, 134, 52, C.ink, true);
    text(s, "A transfer can lose value at more than one step.", 64, 302, 600, 32, 22, C.green, true);
    const xs = [64, 278, 492, 706, 920];
    const labels = ["SEND", "FEE", "FX", "WAIT", "RECEIVE"];
    const subs = ["a family need", "visible + hidden", "rate uncertainty", "processing", "less clarity"];
    for (let i = 0; i < xs.length; i++) {
      box(s, xs[i], 394, 168, 126, i === 0 || i === 4 ? C.ink : C.white, 16, C.soft);
      text(s, labels[i], xs[i] + 18, 420, 132, 26, 18, i === 0 || i === 4 ? C.acid : C.ink, true);
      text(s, subs[i], xs[i] + 18, 458, 134, 42, 16, i === 0 || i === 4 ? C.paper : C.muted, false);
      if (i < xs.length - 1) text(s, "→", xs[i] + 175, 430, 34, 34, 26, C.green, true, "center");
    }
    text(s, "6.36%", 802, 176, 270, 70, 62, C.green, true, "right");
    text(s, "global average cost of sending a remittance", 748, 250, 330, 44, 16, C.muted, false, "right");
    notes(s, "This is bigger than a fee. A sender can encounter the fee, the rate, the conversion, the processing window and uncertainty about what lands. The World Bank's latest Remittance Prices Worldwide reporting puts the global average cost at 6.36 percent. Repeated family support makes those small losses matter.", ["World Bank, Remittance Prices Worldwide, Q3 2025: https://remittanceprices.worldbank.org/"]);
  }

  // 3. Corridor
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    header(s, 3, "Why this corridor", true);
    text(s, "We started where\nthe problem is personal.", 64, 142, 600, 132, 50, C.paper, true);
    text(s, "Ireland", 64, 342, 218, 48, 34, C.acid, true);
    text(s, "Nigeria", 896, 342, 220, 48, 34, C.acid, true, "right");
    line(s, 292, 368, 882, 368, C.acid, 4);
    text(s, "€", 554, 327, 74, 76, 66, C.paper, true, "center");
    text(s, "$20.5B", 64, 454, 350, 72, 60, C.paper, true);
    text(s, "estimated remittances received by Nigeria in 2023", 68, 528, 390, 48, 18, C.muted, false);
    text(s, "5.38M", 806, 454, 350, 72, 60, C.paper, true, "right");
    text(s, "people living in Ireland, April 2024", 796, 528, 360, 48, 18, C.muted, false, "right");
    text(s, "Millions already need the payment. They do not need to know it is on-chain.", 64, 626, 1090, 30, 20, C.acid, true);
    notes(s, "Kobo's initial wedge is Ireland to Nigeria: euro in, USDC out. Nigeria is one of the largest remittance recipient markets in Sub-Saharan Africa. The market figure establishes the scale of the broader receiving market; it is not a claimed estimate of the Ireland-to-Nigeria corridor. The opportunity is people with a real payment need, most of whom should never have to become crypto users.", ["World Bank-KNOMAD, Migration and Development Brief 39, 2023 estimate: https://documents1.worldbank.org/curated/en/099740408142422676/pdf/IDU-84dfd61b-e135-4242-a202-3728b2e8fa86.pdf", "Government of Ireland, Migration - the facts: https://www.gov.ie/en/department-of-the-taoiseach/collections/migration-the-facts/", "Kobo waitlist, product corridor: https://www.kobopayments.com/waitlist"]);
  }

  // 4. Competition
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 4, "The gap");
    text(s, "The market already moves money.\nIt just wasn't built this way.", 64, 142, 840, 110, 46, C.ink, true);
    const cols = [64, 350, 636, 922];
    const names = ["Traditional\nremittance", "Digital\nremittance", "Stablecoin\nproducts", "KOBO"];
    const desc = ["Familiar access\n+ distribution", "Clearer digital\nexperiences", "Efficient settlement\n+ liquidity", "Simple payment\nexperience"];
    const focus = ["Trusted\nby families", "Choice of delivery\nand tracking", "Modern financial\ninfrastructure", "Hide the rail.\nShow the certainty."];
    for (let i = 0; i < cols.length; i++) {
      box(s, cols[i], 326, 244, 258, i === 3 ? C.ink : C.white, 18, C.soft);
      text(s, names[i], cols[i] + 20, 354, 204, 48, 22, i === 3 ? C.acid : C.ink, true, "center");
      text(s, "They do well", cols[i] + 20, 430, 204, 20, 14, i === 3 ? C.muted : C.green, true, "center");
      text(s, desc[i], cols[i] + 20, 461, 204, 44, 17, i === 3 ? C.paper : C.ink, false, "center");
      text(s, focus[i], cols[i] + 20, 524, 204, 42, 16, i === 3 ? C.acid : C.muted, true, "center");
    }
    text(s, "The point is not that incumbents failed. They solved parts of the journey. Kobo is designed to connect them.", 64, 652, 1080, 28, 17, C.green, true);
    notes(s, "We respect the existing players. Western Union and MoneyGram have distribution. Digital specialists such as Remitly make sending much easier. Stablecoin infrastructure players such as Yellow Card bring modern settlement and liquidity. Kobo's opportunity is to make the underlying rail better without asking everyday users to learn wallets or networks. This is a strategic design goal, not a claim that Kobo is already superior on every dimension.", ["Remitly product overview: https://www.remitly.com/us/en/money-transfer", "Yellow Card company overview: https://yellowcard.io/about-us", "Yellow Card supported corridors: https://help.yellowcard.io/articles/8016607239-supported-fiat-receive-send-corridors-by-country"]);
  }

  // 5. Product reveal
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    header(s, 5, "Meet Kobo", true);
    text(s, "Euro in.\nUSDC out.", 64, 154, 470, 132, 56, C.paper, true);
    text(s, "The product is a better payment experience.\nStablecoins are the infrastructure underneath.", 68, 314, 478, 62, 22, C.muted, false);
    box(s, 666, 114, 482, 500, "#F0EFE6", 28, "#51534C");
    text(s, "KOBO", 708, 152, 130, 24, 15, C.ink, true);
    text(s, "Send money home", 708, 202, 366, 36, 28, C.ink, true);
    box(s, 708, 272, 398, 86, C.white, 16, C.soft);
    text(s, "You send", 730, 290, 110, 18, 14, C.muted, true);
    text(s, "€500.00", 730, 313, 150, 28, 25, C.ink, true);
    box(s, 708, 374, 398, 86, "#E1F6B2", 16, "#B5DD4D");
    text(s, "They receive", 730, 392, 150, 18, 14, C.green, true);
    text(s, "USDC", 730, 415, 150, 28, 25, C.ink, true);
    box(s, 708, 500, 398, 54, C.ink, 14, C.ink);
    text(s, "Review transfer", 730, 514, 350, 23, 18, C.acid, true, "center");
    text(s, "One simple payment experience.", 64, 626, 494, 30, 20, C.acid, true);
    notes(s, "This is the reveal. Kobo is not a crypto remittance app. It is a simpler way to move value across borders. The user thinks in euros, the person they care about and certainty. The live product's public waitlist is already framed as Euro in, USDC out. The app walkthrough follows that same mental model.", ["Kobo waitlist: https://www.kobopayments.com/waitlist"]);
  }

  // 6. Demo
  {
    const s = p.slides.add();
    s.background.fill = C.paper;
    header(s, 6, "The demo");
    text(s, "I don't want to think about wallets.\nI just want to send money.", 64, 145, 1050, 106, 44, C.ink, true);
    const steps = ["Choose\na person", "Enter\nthe amount", "See exactly\nwhat lands", "Review\nand send"];
    const x = [64, 330, 596, 862];
    for (let i = 0; i < steps.length; i++) {
      box(s, x[i], 350, 226, 154, i === 3 ? C.ink : C.white, 18, C.soft);
      text(s, `0${i + 1}`, x[i] + 20, 374, 46, 22, 15, i === 3 ? C.acid : C.green, true);
      text(s, steps[i], x[i] + 20, 415, 186, 58, 25, i === 3 ? C.paper : C.ink, true);
      if (i < 3) text(s, "→", x[i] + 229, 404, 36, 34, 28, C.green, true, "center");
    }
    text(s, "Now go live: kobopayments.com", 64, 596, 550, 30, 23, C.green, true);
    text(s, "Keep the interaction under 75 seconds.", 64, 636, 520, 24, 16, C.muted, false);
    notes(s, "This is the moment to open the live demo. Move quickly: choose the recipient, enter the amount, show the recipient amount and review the transfer, then send and land on success. Do not narrate every control. Say: 'I choose who I am sending to, enter the amount, see exactly what they are getting, and send. That's Kobo.' If the live flow is unstable, play a screen recording of this exact real flow - never a fabricated confirmation.", ["Build-state verification: C:/Users/Isaac/Desktop/KOBO/API_CONTRACT.md and local frontend/backend code, reviewed 2026-09-02"]);
  }

  // 7. Solana + built today
  {
    const s = p.slides.add();
    s.background.fill = C.ink;
    header(s, 7, "What is underneath", true);
    text(s, "The rails should disappear.", 64, 142, 768, 64, 50, C.paper, true);
    addArrow(s, 64, 282, 212, "PERSON", true);
    text(s, "→", 282, 301, 54, 40, 30, C.acid, true, "center");
    addArrow(s, 346, 282, 212, "KOBO", true);
    text(s, "→", 564, 301, 54, 40, 30, C.acid, true, "center");
    addArrow(s, 628, 282, 212, "USDC ON SOLANA", true);
    text(s, "→", 846, 301, 54, 40, 30, C.acid, true, "center");
    addArrow(s, 910, 282, 212, "FAMILY WALLET", true);
    text(s, "Built today", 64, 448, 200, 26, 19, C.acid, true);
    text(s, "Account + PIN auth     Recipient flow     Transfer lifecycle\nBalance handling        Solana devnet settlement     On-ramp/webhook handling", 64, 494, 1034, 54, 20, C.paper, false);
    text(s, "Production cash-out is not presented as live. It is next, with the right regulated partner.", 64, 624, 1080, 28, 17, C.muted, false);
    notes(s, "Under the hood, Kobo uses stablecoins and Solana for the settlement rail. The implementation today includes real account and PIN auth, recipient creation, balance handling, transfer status handling, Solana devnet settlement, and on-ramp session plus webhook handling. We deliberately do not claim a live production cash-out or a fully launched regulated payout network. The next step is hardening the flow with the right licensed partners.", ["Local build-state evidence: C:/Users/Isaac/Desktop/KOBO/API_CONTRACT.md and KOBO_BUILD_PLAN.md, reviewed 2026-09-02", "Solana payment documentation: https://solana.com/es/docs/payments", "Solana institutional payments: https://solana.com/solutions/institutional-payments"]);
  }

  // 8. Close
  {
    const s = p.slides.add();
    s.background.fill = C.acid;
    text(s, "KOBO", 64, 48, 180, 28, 16, C.ink, true);
    text(s, "We're building the payment\nexperience our families deserve.", 64, 144, 830, 130, 54, C.ink, true);
    text(s, "We don't need everyone to understand crypto.\nWe need them to understand that their money should move better.", 68, 320, 782, 66, 23, C.green, false);
    text(s, "KOBOPAYMENTS.COM", 68, 518, 620, 34, 27, C.ink, true);
    text(s, "Join the waitlist", 68, 564, 390, 28, 20, C.green, true);
    text(s, "@isaackobo     @shinakobo", 68, 626, 450, 24, 18, C.ink, true);
    box(s, 928, 414, 196, 196, C.white, 18, C.white);
    const qr = await fs.readFile("C:/Users/Isaac/Desktop/KOBO/tmp/kobo-deck/kobo-waitlist-qr.png");
    s.images.add({
      blob: qr.buffer.slice(qr.byteOffset, qr.byteOffset + qr.byteLength),
      contentType: "image/png",
      alt: "QR code for Kobo waitlist",
      fit: "contain",
      position: { left: 944, top: 430, width: 164, height: 164 },
      geometry: "rect",
    });
    notes(s, "Close with the ask: help us get Kobo into the hands of the people who need it. We want early users, direct feedback, distribution introductions and the right infrastructure partners. Then stop. Let the QR code and the line do the work.", ["QR destination: https://www.kobopayments.com/waitlist"]);
  }

  for (let i = 0; i < p.slides.items.length; i++) {
    const slide = p.slides.items[i];
    await writeBlob(`${TMP}/slide-${String(i + 1).padStart(2, "0")}.png`, await p.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(`${TMP}/slide-${String(i + 1).padStart(2, "0")}.layout.json`, await (await slide.export({ format: "layout" })).text());
  }
  await writeBlob(`${TMP}/deck-montage.webp`, await p.export({ format: "webp", montage: true, scale: 1 }));
  const deck = await PresentationFile.exportPptx(p);
  await deck.save(OUT);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
