require('dotenv').config({ path: '.env.local' });
const Replicate = require('replicate');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function test() {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  try {
    const res = await fetch("https://asborc.com/cdn/shop/files/ElementRedB.jpg?v=1712711677");
    const arr = await res.arrayBuffer();
    const tmpFile = path.join(os.tmpdir(), 'wheel.jpg');
    fs.writeFileSync(tmpFile, Buffer.from(arr));

    const output = await replicate.run(
      "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      {
        input: {
          image: fs.createReadStream(tmpFile)
        }
      }
    );
    console.log("Output type:", typeof output);
    if (output && output.url) {
        console.log("URL:", output.url().toString());
    } else {
        console.log("Output:", output);
    }
  } catch(e) {
    console.error("Error:", e);
  }
}
test();
