/** 共享库那条路的探针（M10-2 前置）。
 *  插件的 CSP 是 `script-src 'self'`，而 `'self'` 匹配的是 **scheme+host+port 不是路径** ——
 *  所以理论上插件 import 得到这条路由下的模块。理论要验，这个文件就是靶子。 */
export const SHARED_OK = "宿主共享库到了";
