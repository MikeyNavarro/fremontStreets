import {expect,type Page} from '@playwright/test';
export async function closePanel(page:Page){const dialog=page.getByTestId('game-dialog');if(await dialog.isVisible())await page.getByRole('button',{name:'Close panel',exact:true}).click();}
export async function openMenu(page:Page){const dialog=page.getByTestId('game-dialog');if(await dialog.isVisible()){if(await dialog.getAttribute('data-panel')!=='menu')await page.getByRole('button',{name:'Back to main menu',exact:true}).click();}else await page.getByRole('button',{name:'Open main menu',exact:true}).click();await expect(dialog).toHaveAttribute('data-panel','menu');}
export async function chooseMode(page:Page,mode:'free'|'navigation'|'quiz'|'study'|'zone1-main'){await openMenu(page);await page.locator('#mode-'+mode).click();}
export async function openPanel(page:Page,panel:'zones'|'settings'|'progress'|'routes'|'study'|'navigation'|'help'|'information'){
 const dialog=page.getByTestId('game-dialog');if(await dialog.isVisible()&&await dialog.getAttribute('data-panel')===panel)return;
 if(!await dialog.isVisible()){
  if(['zones','settings','progress'].includes(panel)){await page.locator(`.header-actions [data-open-panel="${panel}"]`).click();return;}
  const session=page.getByTestId('open-training');if(await session.getAttribute('data-open-panel')===panel){await session.click();return;}
 }
 await openMenu(page);
 if(panel==='study'||panel==='navigation')await page.locator(panel==='study'?'#mode-study':'#mode-navigation').click();
 else await page.locator(`[data-screen="menu"] [data-open-panel="${panel}"]`).click();
 await expect(dialog).toHaveAttribute('data-panel',panel);
}
export async function selectZone(page:Page,zone:string){await openPanel(page,'zones');await page.getByTestId('zone-select').selectOption(zone);}
export async function saveCurrentRoute(page:Page){await openPanel(page,'routes');await page.locator('#save-route').click();await closePanel(page);}
