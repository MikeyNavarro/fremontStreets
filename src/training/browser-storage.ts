/** Resolve storage inside callers' guarded operations, never during app startup.
 * Browsers may throw even when reading window.localStorage itself. */
export function browserStorage(resolve:()=>Storage=()=>window.localStorage):Storage {
 return {
  get length(){return resolve().length;},
  key(index){return resolve().key(index);},
  getItem(key){return resolve().getItem(key);},
  setItem(key,value){resolve().setItem(key,value);},
  removeItem(key){resolve().removeItem(key);},
  clear(){resolve().clear();},
 };
}
