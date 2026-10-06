/* 它 import 的是**自己旁边**那份 util（相对路径），不是根目录那份。 */
import { who } from "./util.mjs";
export const sees = who;
