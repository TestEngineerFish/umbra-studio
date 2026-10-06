/* issue #122 的①：入口之外的相对 import。第一版装不起来（算到了进程 cwd 上）。 */
export const greet = () => "helper 在";
