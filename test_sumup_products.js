require("dotenv").config({ path: ".env.local" });

async function run() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!apiKey || !merchantCode) {
    console.log("Missing keys");
    return;
  }

  // Try standard articles endpoint
  const url = `https://api.sumup.com/v0.1/merchants/${merchantCode}/articles`;
  console.log("Fetching", url);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      }
    });
    if (!res.ok) {
      console.log("Failed:", res.status, await res.text());
    } else {
      const data = await res.json();
      console.log("Success! Found", data.length || (data.items ? data.items.length : 0), "products.");
      console.log(JSON.stringify(data).slice(0, 500));
    }
  } catch (e) {
    console.error(e);
  }
}
run();
