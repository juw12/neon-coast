from pathlib import Path
from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', args=['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    context = browser.new_context(offline=True, viewport={'width': 1000, 'height': 720})
    page = context.new_page()
    errors = []
    network = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: network.append(req.url) if req.url.startswith(('http:', 'https:')) else None)
    page.goto(Path('NeonCoast.html').resolve().as_uri())
    page.wait_for_function("window.NEON?.state === 'title'")
    page.evaluate("localStorage.setItem('neon-coast-save-v1', JSON.stringify({mission:2,money:1200,packages:[1,4],difficulty:1,quality:0,sound:0}))")
    page.reload()
    page.click('#btn-ferry')
    assert page.evaluate("NEON.mission.def.name === 'Last Ferry' && NEON.mission.timer === -1 && NEON.save.ferryRuns === 0")
    page.keyboard.press('f')
    page.wait_for_function("NEON.player.car?.type === 'van' && NEON.mission.step === 1")
    page.keyboard.press('p')
    assert page.evaluate("NEON.state === 'paused'")
    frozen = page.evaluate('NEON.mission.timer')
    page.wait_for_timeout(400)
    assert page.evaluate('NEON.mission.timer') == frozen
    page.click('#btn-resume')
    page.keyboard.down('w')
    page.wait_for_function('NEON.player.car.z < NEON.mission.blip[1] + 8')
    page.keyboard.up('w')
    page.keyboard.down('s')
    page.wait_for_function('Math.abs(NEON.player.car.vf) < 1')
    page.keyboard.up('s')
    page.wait_for_function('NEON.mission.step === 2', timeout=8000)
    print('PASS legacy save, title dispatch, van entry, driving, first real curb stop, paused clock', flush=True)
    for step in (2, 3):
        page.evaluate("""() => {
          const car = NEON.player.car;
          [car.x, car.z] = NEON.mission.blip;
          car.vx = 0;
          car.vz = 0;
          car.vf = 0;
        }""")
        page.wait_for_function(f'!NEON.mission.active || NEON.mission.step > {step}')
    assert page.locator('#banner b').text_content() == 'ALL ABOARD'
    assert page.evaluate('NEON.save.ferryRuns === 1 && NEON.save.ferryBest > 0 && NEON.save.mission === 2 && NEON.save.money >= 1650 && NEON.save.packages.length === 2')
    assert page.evaluate("NEON.mission.def.name === 'Midnight Sprint'")
    page.reload()
    page.click('#btn-continue')
    assert page.evaluate('NEON.save.ferryRuns === 1 && NEON.save.ferryBest > 0')
    page.keyboard.press('g')
    page.keyboard.press('p')
    page.click('#btn-end-shift')
    assert page.evaluate("!NEON.mission.active && NEON.mission.def.name === 'Midnight Sprint'")
    page.keyboard.press('g')
    page.evaluate('NEON.mission.timer = .001')
    page.wait_for_function('!NEON.mission.active')
    assert 'ferry sailed' in page.locator('#banner span').text_content()
    page.evaluate("""() => {
      const m = NEON.mission.startMarker;
      NEON.player.x = m.x;
      NEON.player.z = m.z;
    }""")
    page.wait_for_function('NEON.mission.active')
    page.keyboard.press('g')
    assert page.evaluate("NEON.mission.def.name === 'Midnight Sprint' && NEON.MISSIONS.length === 6")
    assert not errors, errors
    assert not network, network
    print('PASS remaining handoffs, payout and best, preserved story, reload, cancel, timeout, active-story guard, offline/no script errors', flush=True)
    browser.close()
