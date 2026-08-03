require("dotenv").config({ path: ".env.local" });
async function run() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  const endpoints = [
    `/v0.1/merchants/${merchantCode}/products`,
    `/v0.1/merchants/${merchantCode}/items`,
    `/v1.0/merchants/${merchantCode}/products`,
  ];
  
  for (const ep of endpoints) {
    const url = `https://api.sumup.com${ep}`;
    console.log("Testing:", url);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) {
      console.log("SUCCESS on", ep);
      return;
    } else {
      console.log("FAILED", res.status);
    }
  }
}
run();
