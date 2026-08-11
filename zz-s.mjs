import { chromium } from "@playwright/test"
const OUT="/private/tmp/claude-501/-Users-uxellent-app-ux/c9cbbbb7-c07a-491a-a76a-4792143614de/scratchpad"
const base=process.argv[2], tag=process.argv[3]
const b=await chromium.launch()
for (const [name,w,h] of [["desktop",1280,900],["phone",390,844]]) {
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2})
  await p.goto(base+"/auditor",{waitUntil:"domcontentloaded"}); await p.waitForTimeout(6000)
  const m=await p.evaluate(()=>{
    const f=document.querySelector("input")
    const box=f?.getBoundingClientRect()
    return {inputX: box?Math.round(box.x):null, inputW: box?Math.round(box.width):null,
            wrapW: (()=>{const e=document.querySelector(".mx-auto");return e?Math.round(e.getBoundingClientRect().width):null})(),
            heading: document.body.innerText.split("\n").filter(Boolean)[0]?.slice(0,40)}
  })
  console.log(tag, name, JSON.stringify(m))
  await p.screenshot({path:`${OUT}/step1-${tag}-${name}.png`, fullPage:false})
  await p.close()
}
await b.close()
