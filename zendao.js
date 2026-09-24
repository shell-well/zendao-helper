// ==UserScript==
// @name        OS-EASY 专属禅道标记助手
// @namespace   Violentmonkey Scripts
// @match       http*://172.16.203.14/*
// @require     https://unpkg.com/jquery@3.3.1/dist/jquery.min.js
// @require     https://cdn.jsdelivr.net/gh/honxinn/workday-cn@48b29366ab802a70b7ca54caf9d3b60982accb10/lib/workday-cn.umd.js
// @grant       GM_addStyle
// @grant       GM_setClipboard
// @run-at      document-start
// @version     2.1.3
// @author      LHQ & CHH & ZCX && zagger
// @license     GPLv3
// @description 禅道助手: 工时统计(工时提醒/每日工时计算)、Bug管理(留存时间标记/一键复制/新标签页打开)、工作流优化(强制工时填写/解决方案提示)、悬浮球快捷工具
// @downloadURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.user.js
// @updateURL https://update.greasyfork.org/scripts/502308/OS-EASY%20%E4%B8%93%E5%B1%9E%E7%A6%85%E9%81%93%E6%A0%87%E8%AE%B0%E5%8A%A9%E6%89%8B.meta.js
// ==/UserScript==

(() => {
  // 禅道打开后会在右下角弹出升级提示（企业版无关闭该提示的配置项），
  // 在 document-start 阶段抢先写入 hidePatch cookie 拦截该提示（等价于 $.cookie("hidePatch", true)），并持久化 30 天
  try {
    document.cookie = 'hidePatch=true; path=/; max-age=2592000';
    console.log('(zm) 已设置 hidePatch=true，拦截升级提示');
  } catch (e) {
    console.warn('(zm) 设置 hidePatch 失败', e);
  }

  $.noConflict(true)(document).ready(async ($) => {
      // 面板策略管理
      const panelStrategies = {
        strategies: {},
        currentStrategy: null,
        
        register(name, strategy) {
          if (!strategy.title || !strategy.render) {
            console.error('Strategy must have title and render function');
            return;
          }
          this.strategies[name] = strategy;
        },

        async switchStrategy(name, content) {
          // 取消之前策略的所有请求
          requestManager.clear();
          
          // 更新当前策略
          this.currentStrategy = name;
          
          // 清空内容并显示加载状态
          content.empty().html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
          
          try {
            const strategy = this.strategies[name];
            const renderPromise = strategy.render(content);
            
            // 等待渲染完成
            await renderPromise;
            
            // 如果在渲染过程中切换了策略，则不显示结果
            if (this.currentStrategy !== name) {
              content.empty();
            }
          } catch (err) {
            if (err.name !== 'AbortError') {
              content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
            }
          }
        },

        getAll() {
          return this.strategies;
        },

        get(name) {
          return this.strategies[name];
        }
      };

      // 添加请求管理器
      const requestManager = {
        requests: new Map(),
        
        register(key, controller) {
          // 取消之前的请求
          this.abort(key);
          // 注册新请求
          this.requests.set(key, controller);
        },
        
        abort(key) {
          if (this.requests.has(key)) {
            this.requests.get(key).abort();
            this.requests.delete(key);
          }
        },
        
        clear() {
          // 取消所有请求
          this.requests.forEach(controller => controller.abort());
          this.requests.clear();
        }
      };

      // 初始化
      await initialize();

      // 定义颜色常量
      const colors = {
          green: '#82E0AA',
          yellow: '#F7DC6F',
          brown: '#FE9900',
          red: '#E74C3C'
      };

      // 公共任务类型配置
      const commonTaskTypes = {
          development: {
              title: '开发任务',
              color: '#007bff',
              items: [
                  {name: '【立项项目开发任务】', desc: '版本开发计划中包含的所有任务，有明确的禅道需求'},
                  {name: '【定制项目】', desc: '外部临时插入，以产品经理邮件为准，需要有禅道需求'},
                  {name: '【专项开发任务】', desc: '没有明确需求的隐形专项开发任务，不在版本开发计划中体现，包含预研/设计/性能/稳定性/代码优化等'}
              ]
          },
          management: {
              title: '管理任务',
              color: '#28a745',
              items: [
                  {name: '【培训任务】', desc: '参加内外部培训，技术纷享等'},
                  {name: '【学习任务】', desc: '新员工熟悉工作内容，开发人员学习新的工作方法等'},
                  {name: '【会议】', desc: '参加各种类型的会议，项目启动会、需求串讲会、计划评审会、项目周会、项目站会、项目复盘会、其他各类临时会议等'},
                  {name: '【管理任务】', desc: '项目管理类工作（制定项目计划、跟踪项目进展等）、人员管理类工作（人员招聘、绩效考核等）、编写管理规范类文档'}
              ]
          },
          support: {
              title: '支持任务',
              color: '#ffc107',
              items: [
                  {name: '【对外支持】', desc: '外部疑问解答，仅指导技术人员或排查疑问'},
                  {name: '【协助他人】', desc: '内部产品测试过程中外部原因导致的产品BUG（需关联到禅道问题单），协助测试人员排查环境问题，帮助其他开发搭建环境等'}
              ]
          }
      };

      // 公共函数：插入内容到页面
      function insertContentToPage(content) {
          const blankDiv = $('#mainContent > form > div')[0];
          if (blankDiv) {
              blankDiv.style.paddingTop = '0';
              blankDiv.innerHTML = content;
          } else {
              $(content).insertBefore('#mainContent > form > #objectTable');
          }
      }

      // 公共函数：添加视觉反馈
      function addVisualFeedback(element, color = '#d4edda') {
          element.css('background-color', color);
          setTimeout(() => element.css('background-color', 'white'), 300);
      }

      // 设置通用的点击事件监听器
      setBodyClickListener();
      // 根据当前路径进行不同的处理
      const path = document.location.pathname;
      // 如果路径中包含 my-work-bug，设置分页 cookie 以便一次加载更多条目
      try {
        if (path.indexOf('my-work-bug') !== -1) {
          setCookie('pagerMyBug', 500);
          console.log('(zm) 已设置 pagerMyBug=500（路由匹配）');
        }
      } catch (e) {
        console.warn('(zm) 设置 pagerMyBug 失败', e);
      }
      switch (path) {
          case '/effort-calendar.html':
              handleEffortCalendar(colors);
              break;
          case '/my-work-bug.html':
              handleMyWorkBug(colors);
              break;
          default:
              handleDefaultPath(path);
              break;
      }

      // 初始化函数
      async function initialize() {
          const userName = localStorage.getItem('zm-username');
          if (!userName) {
              const name = prompt("看上去你是第一次使用，请输入禅道中的姓名：");
              if (name) localStorage.setItem('zm-username', name);
              else return;
          }
          $("td.text-left a").attr('target', '_blank');
          
          // 添加悬浮球和面板样式
          GM_addStyle(`
              .zm-float-ball {
                  position: fixed;
                  left: 105px;
                  top: 4px;
                  width: 36px;
                  height: 36px;
                  background: #1890ff;
                  border-radius: 50%;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  cursor: pointer;
                  z-index: 9999;
                  transition: all 0.3s;
              }
              .zm-float-ball::after {
                  content: '';
                  position: absolute;
                  width: 100%;
                  height: 100%;
                  border-radius: 50%;
                  border: 2px solid #1890ff;
                  animation: ripple 1.5s ease-out infinite;
              }
              @keyframes ripple {
                  0% {
                      transform: scale(1);
                      opacity: 0.8;
                  }
                  100% {
                      transform: scale(1.5);
                      opacity: 0;
                  }
              }
              .zm-float-ball:hover {
                  transform: scale(1.1);
              }
              .zm-float-ball i {
                  color: white;
                  font-size: 24px;
              }
              .zm-panel {
                  position: fixed;
                  right: 80px;
                  top: 50%;
                  transform: translateY(-50%);
                  width: 300px;
                  background: white;
                  border-radius: 8px;
                  box-shadow: 0 3px 6px -4px rgba(0,0,0,.12), 0 6px 16px 0 rgba(0,0,0,.08);
                  z-index: 9998;
                  display: none;
              }
              .zm-panel-header {
                  padding: 12px 16px;
                  border-bottom: 1px solid #f0f0f0;
                  font-weight: bold;
              }
              .zm-panel-content {
                  max-height: 400px;
                  overflow-y: auto;
                  scrollbar-width: thin;
                  scrollbar-color: rgba(0,0,0,.2) transparent;
              }
              .zm-panel-content::-webkit-scrollbar {
                  width: 6px;
              }
              .zm-panel-content::-webkit-scrollbar-track {
                  background: transparent;
              }
              .zm-panel-content::-webkit-scrollbar-thumb {
                  background-color: rgba(0,0,0,.2);
                  border-radius: 3px;
                  border: none;
              }
              .zm-panel-content::-webkit-scrollbar-thumb:hover {
                  background-color: rgba(0,0,0,.3);
              }
              .zm-panel-item {
                  padding: 12px 16px;
                  border-bottom: 1px solid #f0f0f0;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
              }
              .zm-panel-item:hover {
                  background: #f5f5f5;
              }
              .zm-hours {
                  color: #ff4d4f;
                  font-weight: bold;
              }
          `);

          // 创建悬浮球和面板
          createFloatBall();
      }

      // 设置通用的点击事件监听器
      function setBodyClickListener() {
          document.body.onclick = async function (e) {
              if (e instanceof PointerEvent) {
                  const aTag = getATag(e.target);
                  if (!aTag) return;
                  const aHref = $(aTag).attr('href');
                  if (aHref?.includes('bug-resolve')) {
                      await generatorResolveType();
                  }
              }
          };
      }

      // 获取点击的A标签
      function getATag(target) {
          if (target.tagName === 'A') return target;
          if (target.parentElement.tagName === 'A') return target.parentElement;
          return null;
      }

      // 处理 effort-calendar 页面
      function handleEffortCalendar(colors) {
          GM_addStyle(`
              span.zm-day { font-weight: bold; margin: 0 8px; }
              .warn { color: ${colors.brown}; }
              .fine { color: ${colors.green}; }
          `);
          waitForContentInContainer('#main', 'table').then(element => {
              const observer = new MutationObserver(() => markEffortCalendar(element, observer));
              observer.observe(element, { subtree: true, childList: true });
              markEffortCalendar(element, observer);
          });
      }

      // 标记 effort-calendar 页面的数据
      function markEffortCalendar(element, observer) {
          observer.disconnect();
          const days = element.querySelectorAll(".cell-day");
          days.forEach(dayElement => {
              const total = calculateTotalTime(dayElement);
              updateDayElement(dayElement, total);
          });
          observer.observe(element, { subtree: true, childList: true });
      }

      // 计算时间总和
      function calculateTotalTime(dayElement) {
          const timeEles = dayElement.querySelectorAll('.has-time .time');
          return Array.from(timeEles).reduce((total, time) => total + parseFloat(time.textContent), 0);
      }

      // 更新天数元素的显示
      function updateDayElement(dayElement, total) {
          $(dayElement).find('.zm-day').remove();
          $(dayElement).find('.copy-time').remove();
          if (total != 0) {
              const colorClass = total > 10 || total < 8 ? 'warn' : 'fine';
              $(dayElement).find('.heading').prepend(`<span class="zm-day ${colorClass}">【${total.toFixed(1)}小时】</span>`);
              $(dayElement).find('.heading').prepend(`<div class="copy-time btn-toolbar pull-left" style="margin-left:25px;display:flex;align-items:center;">复制</div>`);
              $(dayElement).find('.heading').find('.copy-time').on('click', async function (e) { copyTaskTime(e) })
          }
      }

      
      // 复制任务时间
      async function copyTaskTime(e) {
        e.stopPropagation()
        const targetEle = e.target
        const content = $(targetEle).parent('.heading').next('.content')
        function calculateTaskTimes(startTime, tasks) {
          let currentHour = parseInt(startTime.split(':')[0])
          let currentMinute = parseInt(startTime.split(':')[1])
          const results = []
          let startDate = new Date()
          startDate.setHours(currentHour)
          startDate.setMinutes(currentMinute)

          const middleStartDate = new Date()
          middleStartDate.setHours(12)
          middleStartDate.setMinutes(0)
          const middleEndDate = new Date()
          middleEndDate.setHours(14)
          middleEndDate.setMinutes(0)

          let endDate = null

          tasks.forEach((task) => {
            const hourStamp = 60 * 60 * 1000
            const timeParts = task.time.split('h')
            let hours = timeParts[0] * 1
            let startStamp = startDate.getTime()
            const middleStamp = middleStartDate.getTime()
            const middleEndStamp = middleEndDate.getTime()
            let endStamp = startStamp + hours * hourStamp

            if (startStamp <= middleStamp && endStamp > middleStamp) {
              endStamp = endStamp + 2 * hourStamp
            }
            const start = new Date(startStamp)
            const end = new Date(endStamp)
            const startTimeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`
            const endTimeStr = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
            startDate = new Date(endStamp)
            results.push({
              ...task,
              start: startTimeStr,
              end: endTimeStr
            })
          })

          return results
        }

        // 示例用法
        const start = '08:30'
        let tempTasks = Array.from(
          content
            .find('.events')
            .find('.event')
            .map(function () {
              const title = $(this).find('.title').text().trim()
              const time = $(this).find('.time').text().trim()
              const id = $(this).data('id')
              return {
                id,
                time,
                title
              }
            })
        )
        tempTasks = calculateTaskTimes(start, tempTasks)
        const parseTaskDoc = function (doc) {
          const objReg = new RegExp(`对象\n`)
          const id = $(doc).find('.main-header span.label').text()
          let item = {}
          $(doc)
            .find('table tbody tr')
            .each(function () {
              const text = $(this).text()
              if (objReg.test(text)) {
                item.obj = text.replace(objReg, '').replace('\n', '').trim()
                item.href = $(this).find('a').attr('href')
              }
            })
          return { ...item, id }
        }
        const fetchTaskData = async function () {
          const docs = await Promise.all(
            tempTasks.map(async function (t) {
              return fetchDocument(
                `/effort-view-${t.id}.html?onlybody=yes&tid=i2sh4q46`
              )
            })
          )
          return docs.map((d) => parseTaskDoc(d))
        }
        const taskObjData = await fetchTaskData()
        let tasks = tempTasks.map((t) => {
          const findOne = taskObjData.find(
            (task) => task.id * 1 === t.id * 1
          )
          return { ...t, ...findOne }
        })
        tasks = tasks
          .map((t) => {
            return `- [ ] ${t.start} - ${t.end} #工时 ${t.time}\t${t.title}\t ${t.obj && t.href ? `[${t.obj}](${location.origin + t.href})\t` : ''}\n`
          })
          .join('')
        GM_setClipboard(tasks)
      }

      // 设置 执行-版本-6.0.5-future-我解决的bug 页面功能
      function setupResolvedByMeBuildPage() {
        $(
          '<div class="btn btn-success" style="margin-right:10px;">勾选自己</div>'
        )
          .on('click', function () {
            const trList = $('#bugList tbody > tr')
            trList.each(function () {
              const tds = $(this).find('td')
              const name = $(tds[5]).text().trim()
              if (name.includes(localStorage.getItem('zm-username'))) {
                $(this).trigger('click')
              }
            })
          })
          .insertBefore('#bugs .actions a')
          
        $(
          '<div class="btn btn-success" style="margin-right:10px;">复制勾选</div>'
        )
          .on('click', function () {
            const bugs = $('tr.checked')
              .map(function () {
                const tds = $(this).find('td')
                const id = $(tds[0]).text().trim()
                const raw = $(tds[1]).text().trim()
                let range = raw.match(/【([^【】]+?\/.+?)】/)
                range = !range ? '' : range[1].replace(/(\d\.?|-){3}/, '') // 移除版本号
                const title = raw.slice(raw.lastIndexOf('】') + 1)
                return `${localStorage.getItem('zm-username')}\t\t${id} ${title}\t${range}\n`
              })
              .get()
              .join('')
            GM_setClipboard(bugs)
          })
          .insertBefore('#bugs .actions a')
          
      }
      
      // 处理 my-work-bug 页面
      function handleMyWorkBug(colors) {
          GM_addStyle(`
              td.text-left.nobr { white-space: normal; }
              span.zm-mark { padding: 2px; border-radius: 4px; border: 1px solid; font-size: .9em; }
          `);
              addBugFetchButton(colors);
      }

      // 添加获取bug时间按钮
      function addBugFetchButton(colors) {
          const $toolbar = $(`<div class="btn-toolbar pull-right zm-board-toolbar" style="display:flex;align-items:center;gap:8px;"></div>`);

          const $fetchBtn = $(`<div class="btn btn-warning">获取bug时间</div>`)
            .on('click', async function () {
              let bugData = await fetchBugData();
              bugData = bugData.map(({ start, hasReactive }) => ({ ...timeRangeStr(start), processed: hasReactive }))
              updateBugTimeCells(bugData, colors);
            });

          const $boardBtn = $(`<div class="btn btn-primary">打开看板</div>`)
            .on('click', function () {
              openBoardsPanel(colors);
            });

          const $hint = $(`<span style="color:${colors.red};">一页超过8个Bug时需要手动获取</span>`);

          $toolbar.append($fetchBtn, $boardBtn, $hint).appendTo('#mainMenu');

          // 自动点击按钮以加载数据
          if ($('tr').length < 9) $fetchBtn.click();
      }

      // 打开看板面板（基于当前页数据）
      function openBoardsPanel(colors) {
        // 如果已存在则切换显示
        if ($('.zm-boards-panel').length > 0) {
          $('.zm-boards-panel').toggle();
          return;
        }

        // 样式（更清晰的列与卡片布局，卡片垂直堆叠，紧凑操作）
        GM_addStyle(`
          :root{ --zm-bg:#ffffff; --zm-surface:#fbfbfc; --zm-muted:#8a8f98; --zm-danger: #ff5d5d; --zm-accent:#1677ff; --zm-border:#eef0f3; --zm-card-shadow:0 6px 18px rgba(20,20,30,0.04); }
          .zm-boards-panel { position: fixed; right: 20px; top: 72px; bottom: 20px; left: 60px; background: var(--zm-bg); z-index: 99999; border-radius: 10px; box-shadow: 0 16px 48px rgba(10,10,20,0.06); display: flex; flex-direction: column; overflow: hidden; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;
          }
          .zm-boards-header { padding: 14px 18px; border-bottom: 1px solid var(--zm-border); display:flex; align-items:center; justify-content:space-between; background: linear-gradient(90deg,#fff, #fbfcff); }
          .zm-boards-header strong{ font-size:15px; color:#20252b }
          .zm-boards-body { padding: 16px; flex:1; overflow:auto; }
          .zm-boards-columns { display:flex; gap:18px; align-items:flex-start; flex-wrap:nowrap; }
          .zm-board-column { flex: 0 0 300px; background: var(--zm-surface); border:1px solid var(--zm-border); border-radius:8px; padding:10px; box-sizing:border-box; max-height: calc(100vh - 200px); overflow:auto; }
          .zm-board-column .zm-board-title { font-weight:700; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; font-size:14px; color:#1f2630 }
          .zm-board-title .zm-del-board { background:transparent;border:0;color:var(--zm-danger);cursor:pointer;padding:6px;border-radius:6px }
          .zm-board-tabs { display:flex; gap:8px; margin-bottom:10px; }
          .zm-board-tab { padding:6px 10px; background:transparent; border:1px solid transparent; border-radius:6px; cursor:pointer; font-size:12px; color:var(--zm-muted) }
          .zm-board-tab.active { background: var(--zm-accent); color: #fff; border-color: var(--zm-accent) }
          .zm-board-list { display:flex; gap:10px; flex-direction:column; }
          .zm-board-card { background:var(--zm-bg); padding:10px 12px; border-radius:8px; box-shadow: var(--zm-card-shadow); font-size:13px; width:100%; overflow:hidden; display:flex; align-items:center; justify-content:space-between; border:1px solid rgba(0,0,0,0.02) }
          .zm-board-card .title { font-weight:600; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#111827 }
          .zm-board-card .meta { color:var(--zm-muted); font-size:12px; margin-top:6px }
          .zm-card-left{ display:flex;flex-direction:column;gap:4px;flex:1;padding-right:8px }
          .zm-card-actions{ display:flex;flex-direction:column;gap:6px;align-items:flex-end }
          .zm-remove-bug{ background:transparent;border:1px solid var(--zm-border);padding:6px 8px;border-radius:6px;color:var(--zm-muted);cursor:pointer;font-size:12px }
          .zm-move-select{ border:1px solid var(--zm-border);padding:6px 8px;border-radius:6px;font-size:12px;color:var(--zm-muted);background:#fff }
          .zm-board-actions { display:flex; gap:8px; align-items:center }
          .zm-board-create { margin-left:12px }
          /* 创建模态微调 */
          .zm-create-product-list .zm-prod-item{ padding:8px;border-radius:6px;cursor:pointer }
          .zm-create-product-list .zm-prod-item:hover{ background:#f4f7fb }
          .zm-badge{ display:inline-block; min-width:20px; height:20px; padding:0 6px; line-height:20px; font-size:12px; color:#fff; background:var(--zm-accent); border-radius:10px; text-align:center; margin-left:8px }
          .zm-sidebar-item{ display:flex;align-items:center;justify-content:space-between }
        `);

        // 构建数据（取当前页）
        const rows = $('#bugList tbody tr');
        const bugs = [];
        rows.each(function () {
          const $tr = $(this);
          const id = $tr.find('input[name="bugIDList[]"]').val();
          const title = $tr.find('td:nth-child(5) a').text().trim();
          const href = $tr.find('td:nth-child(5) a').attr('href');
          const product = $tr.find('td:nth-child(6) a').text().trim() || '未分配产品';
          const severity = $tr.find('td:nth-child(2) span.label-severity').attr('data-severity') || '0';
          const opener = $tr.find('td:nth-child(8)').text().trim();
          bugs.push({ id, title, href, product, severity: String(severity), opener });
        });

        // 读取自定义看板并收集已加入的 bug id
        const customBoards = loadCustomBoards();
        const customBugIds = new Set();
        customBoards.forEach(cb => (cb.bugIds || []).forEach(id => customBugIds.add(String(id))));

        // 按产品分组（排除已加入自定义看板的 bug）
        const byProduct = {};
        bugs.forEach(b => {
          if (customBugIds.has(String(b.id))) return; // 已在自定义看板中，跳过
          if (!byProduct[b.product]) byProduct[b.product] = [];
          byProduct[b.product].push(b);
        });

        // 面板HTML：左侧看板列表（tabs），右侧内容区（单个看板内容）
        const $panel = $(`
          <div class="zm-boards-panel">
            <div class="zm-boards-header">
              <div style="display:flex;align-items:center;gap:12px;">
                <strong>Bug 看板（仅展示当前页Bug）</strong>
                <span style="color:#999;font-size:12px;">共 ${bugs.length} 条</span>
                <button class="btn btn-sm btn-default zm-board-create">新建看板</button>
              </div>
              <div class="zm-board-actions">
                <button class="btn btn-sm" id="zm-close-boards">关闭</button>
              </div>
            </div>
            <div class="zm-boards-body" style="display:flex;gap:12px;">
              <div class="zm-board-sidebar" style="width:260px;overflow:auto;padding:8px;border-right:1px solid var(--zm-border);"></div>
              <div class="zm-board-content" style="flex:1;overflow:auto;padding:8px;"></div>
            </div>
          </div>
        `);

        $('body').append($panel);

        const $sidebar = $panel.find('.zm-board-sidebar');
        const $content = $panel.find('.zm-board-content');

        // 构建侧栏：先自定义看板，再产品列表（侧栏显示徽章计数）
        customBoards.forEach(cb => {
          const count = (cb.bugIds||[]).length || 0;
          const $item = $(`<div class="zm-sidebar-item" data-name="${escapeHtml(cb.name)}" data-custom="1" style="padding:10px;border-radius:6px;cursor:pointer;margin-bottom:6px;background:transparent">` +
            `<span>${escapeHtml(cb.name)}</span><span class="zm-badge">${count}</span></div>`);
          $item.on('click', function () {
            $sidebar.find('.zm-sidebar-item').css('background','');
            $(this).css('background','#f5f7fb');
            showBoard(cb.name, true);
          });
          $sidebar.append($item);
        });

        Object.keys(byProduct).forEach(prod => {
          const pbugs = byProduct[prod];
          const count = (pbugs||[]).length || 0;
          const $item = $(`<div class="zm-sidebar-item" data-name="${escapeHtml(prod)}" data-custom="0" style="padding:10px;border-radius:6px;cursor:pointer;margin-bottom:6px;background:transparent">` +
            `<span>${escapeHtml(prod)}</span><span class="zm-badge">${count}</span></div>`);
          $item.on('click', function () {
            $sidebar.find('.zm-sidebar-item').css('background','');
            $(this).css('background','#f5f7fb');
            showBoard(prod, false);
          });
          $sidebar.append($item);
        });

        // 打开看板函数：在右侧展示单个看板内容（复用 renderBoardColumn）
        function showBoard(name, isCustom) {
          $content.empty();
          if (isCustom) {
            const cb = customBoards.find(x => x.name === name);
            const items = bugs.filter(b => (cb.bugIds||[]).includes(String(b.id)));
            const $col = renderBoardColumn(cb.name, items, true);
            // 添加删除按钮到标题
            const $del = $(`<button class="zm-del-board" title="删除看板">删除看板</button>`);
            $del.on('click', function () {
              if (confirm('确认删除自定义看板：' + cb.name + '？')) {
                deleteCustomBoard(cb.name);
                $panel.remove();
                openBoardsPanel(colors);
              }
            });
            $col.find('.zm-board-title').append($del);
            $content.append($col);
          } else {
            const items = byProduct[name] || [];
            const $col = renderBoardColumn(name, items, false);
            $content.append($col);
          }
        }

        // 默认选中第一个侧栏项
        const $first = $sidebar.find('.zm-sidebar-item').first();
        if ($first.length) { $first.css('background','#f5f7fb'); showBoard($first.data('name'), $first.data('custom') === 1 || $first.data('custom') === '1'); }

        // 事件绑定
        $panel.find('#zm-close-boards').on('click', function () { $panel.remove(); });
        $panel.find('.zm-board-create').on('click', function () { showCreateBoardModal(bugs); });

        function renderBoardColumn(title, items, isCustom = false) {
          const $col = $(`<div class="zm-board-column"></div>`);
          const $title = $(`<div class="zm-board-title"><span>${title}<span class="zm-badge">${items.length || 0}</span></span></div>`);
          $col.append($title);

          // tabs for severity (labelled as "1级"... but data stored as numeric)
          const severities = [{label:'全部', val:''}, {label:'1级', val:'1'}, {label:'2级', val:'2'}, {label:'3级', val:'3'}, {label:'4级', val:'4'}];
          const $tabs = $(`<div class="zm-board-tabs"></div>`);
          severities.forEach((t, idx) => {
            const $tab = $(`<div class="zm-board-tab" data-val="${t.val}">${t.label}</div>`);
            if (idx === 0) $tab.addClass('active');
            $tab.on('click', function () {
              $tabs.find('.zm-board-tab').removeClass('active');
              $(this).addClass('active');
              const tabVal = $(this).data('val');
              renderCards(tabVal);
            });
            $tabs.append($tab);
          });
          $col.append($tabs);

          const $list = $(`<div class="zm-board-list"></div>`);
          $col.append($list);

          function renderCards(tab) {
            $list.empty();
            const filtered = items.filter(it => {
              if (!tab) return true;
              return String(it.severity) === String(tab);
            });
            if (filtered.length === 0) {
              $list.append(`<div style="color:#999;">无匹配的Bug</div>`);
              return;
            }
            filtered.forEach(b => {
              if (isCustom) {
                const $card = $(
                  `<div class="zm-board-card">` +
                    `<div class="zm-card-left">` +
                      `<a href="${b.href}" target="_blank" class="title" title="${escapeHtml(b.title)}">#${b.id} ${escapeHtml(b.title)}</a>` +
                      `<div class="meta">${escapeHtml(b.opener)} · ${escapeHtml(b.product)}</div>` +
                    `</div>` +
                    `<div class="zm-card-actions">` +
                      `<button class="zm-remove-bug" data-id="${b.id}" title="移除">✕</button>` +
                      `<select class="zm-move-select" data-id="${b.id}"><option value="">移动到...</option></select>` +
                    `</div>` +
                  `</div>`
                );
                // populate move select
                const $select = $card.find('.zm-move-select');
                customBoards.forEach(cb => {
                  if (cb.name === title) return;
                  $select.append(`<option value="${escapeHtml(cb.name)}">${escapeHtml(cb.name)}</option>`);
                });
                $select.on('change', function() {
                  const target = $(this).val();
                  const bugId = $(this).data('id');
                  if (!target) return;
                  moveBugBetweenBoards(title, target, String(bugId));
                });
                $card.find('.zm-remove-bug').on('click', function() {
                  const bugId = $(this).data('id');
                  if (!confirm('确认从看板中移除 #' + bugId + ' ?')) return;
                  removeBugFromBoard(title, String(bugId));
                });
                $list.append($card);
              } else {
                const $card = $(
                  `<div class="zm-board-card">` +
                    `<div class="zm-card-left">` +
                      `<a href="${b.href}" target="_blank" class="title" title="${escapeHtml(b.title)}">#${b.id} ${escapeHtml(b.title)}</a>` +
                      `<div class="meta">${escapeHtml(b.opener)}</div>` +
                    `</div>` +
                  `</div>`
                );
                $list.append($card);
              }
            });
          }

          // 初始渲染全部（使用空值表示全部）
          renderCards('');
          return $col;
        }

        // 移除 bug 从自定义看板
        function removeBugFromBoard(boardName, bugId) {
          const list = loadCustomBoards();
          const idx = list.findIndex(b => b.name === boardName);
          if (idx === -1) return;
          list[idx].bugIds = (list[idx].bugIds || []).filter(id => String(id) !== String(bugId));
          localStorage.setItem('zm-custom-boards', JSON.stringify(list));
          // 重新渲染面板
          $('.zm-boards-panel').remove();
          openBoardsPanel(colors);
        }

        // 在自定义看板之间移动 bug
        function moveBugBetweenBoards(srcName, targetName, bugId) {
          const list = loadCustomBoards();
          const src = list.find(b => b.name === srcName);
          const tgt = list.find(b => b.name === targetName);
          if (!src || !tgt) return;
          // remove from src
          src.bugIds = (src.bugIds || []).filter(id => String(id) !== String(bugId));
          // add to tgt if not exist
          if (!(tgt.bugIds || []).includes(String(bugId))) {
            tgt.bugIds = (tgt.bugIds || []).concat([String(bugId)]);
          }
          localStorage.setItem('zm-custom-boards', JSON.stringify(list));
          // 重新渲染面板
          $('.zm-boards-panel').remove();
          openBoardsPanel(colors);
        }

        function escapeHtml(str) {
          return (str || '').replace(/[&<>\\\"]/g, function (s) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]); });
        }

        function showCreateBoardModal(allBugs) {
          const customBoardsForModal = loadCustomBoards();
          const occupied = new Set();
          customBoardsForModal.forEach(cb => (cb.bugIds || []).forEach(id => occupied.add(String(id))));

          const byProduct = {};
          allBugs.forEach(b => {
            if (!byProduct[b.product]) byProduct[b.product] = [];
            byProduct[b.product].push(b);
          });
          const products = Object.keys(byProduct).sort();

          const modal = `
            <div class="zm-create-board-overlay" style="position:fixed;left:0;top:0;right:0;bottom:0;z-index:100000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;">
              <div style="background:white;padding:12px;border-radius:8px;max-width:920px;width:95%;max-height:86vh;overflow:hidden;display:flex;flex-direction:column;">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #eee;">
                  <h3 style="margin:0;font-size:16px;">新建看板</h3>
                  <div style="display:flex;gap:8px;align-items:center;"><input class="form-control zm-new-board-name" placeholder="看板名称" style="width:260px;padding:6px 8px;"/></div>
                </div>
                <div style="flex:1;display:flex;overflow:hidden;">
                  <div style="width:220px;border-right:1px solid #eee;overflow:auto;padding:8px;">
                    <div style="font-size:13px;color:#666;margin-bottom:8px;">按产品选择（仅显示未加入自定义看板的 Bug）</div>
                    <div class="zm-create-product-list" style="display:flex;flex-direction:column;gap:6px;"></div>
                  </div>
                  <div style="flex:1;padding:8px;overflow:auto;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                      <div style="font-size:13px;color:#666;">产品内 Bug 列表</div>
                      <div><button class="btn btn-xs btn-default zm-select-all">全选</button> <button class="btn btn-xs btn-default zm-clear-all">清空</button></div>
                    </div>
                    <div class="zm-create-bug-list" style="display:flex;flex-direction:column;gap:6px;"></div>
                  </div>
                </div>
                <div style="padding:8px;border-top:1px solid #eee;display:flex;justify-content:flex-end;gap:8px;">
                  <button class="btn btn-default zm-cancel-create">取消</button>
                  <button class="btn btn-primary zm-confirm-create">创建</button>
                </div>
              </div>
            </div>
          `;

          const $modal = $(modal);
          $('body').append($modal);

          const $prodList = $modal.find('.zm-create-product-list');
          const $bugList = $modal.find('.zm-create-bug-list');

          // render product tabs (left)
          products.forEach((p, idx) => {
            const count = (byProduct[p] || []).filter(b => !occupied.has(String(b.id))).length;
            const $item = $(`<div class="zm-prod-item" data-prod="${escapeHtml(p)}" style="padding:6px;border-radius:4px;cursor:pointer;${idx===0? 'background:#f5f5f5;':''}">${escapeHtml(p)} <span style="color:#999;font-size:12px;">(${count})</span></div>`);
            $item.on('click', function() {
              $prodList.find('.zm-prod-item').css('background','');
              $(this).css('background','#f5f5f5');
              renderProductBugs(p);
            });
            $prodList.append($item);
          });

          function renderProductBugs(prod) {
            $bugList.empty();
            const list = (byProduct[prod] || []).filter(b => !occupied.has(String(b.id)));
            if (list.length === 0) {
              $bugList.append('<div style="color:#999">没有可选的 Bug</div>');
              return;
            }
            list.forEach(b => {
              const $row = $(`<label style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #f2f2f2;"><input type="checkbox" class="zm-new-board-checkbox" value="${b.id}"> <div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">#${b.id} ${escapeHtml(b.title)} <span style="color:#999">(${escapeHtml(b.opener)})</span></div></label>`);
              $bugList.append($row);
            });
          }

          // initial render first product
          if (products.length > 0) renderProductBugs(products[0]);

          $modal.find('.zm-select-all').on('click', function() { $modal.find('.zm-new-board-checkbox').prop('checked', true); });
          $modal.find('.zm-clear-all').on('click', function() { $modal.find('.zm-new-board-checkbox').prop('checked', false); });

          $modal.find('.zm-cancel-create').on('click', function () { $modal.remove(); });
          $modal.find('.zm-confirm-create').on('click', function () {
            const name = $modal.find('.zm-new-board-name').val().trim();
            if (!name) { alert('请输入看板名称'); return; }
            const ids = $modal.find('.zm-new-board-checkbox:checked').map(function(){ return String($(this).val()); }).get();
            if (ids.length === 0) { alert('请至少选择一个Bug'); return; }
            // 保存并重绘
            saveCustomBoard({ name, bugIds: ids });
            $modal.remove();
            $('.zm-boards-panel').remove();
            openBoardsPanel(colors);
          });
        }

        function loadCustomBoards() {
          try { return JSON.parse(localStorage.getItem('zm-custom-boards') || '[]'); } catch (e) { return []; }
        }

        function saveCustomBoard(board) {
          const list = loadCustomBoards();
          // replace if same name
          const idx = list.findIndex(b => b.name === board.name);
          if (idx >= 0) list[idx] = board; else list.push(board);
          localStorage.setItem('zm-custom-boards', JSON.stringify(list));
        }

        function deleteCustomBoard(name) {
          const list = loadCustomBoards().filter(b => b.name !== name);
          localStorage.setItem('zm-custom-boards', JSON.stringify(list));
        }
      }

      // 获取Bug数据
      async function fetchBugData() {
          const bugUrls = $("tr td:nth-child(5) a").map((_, ele) => ele.href).get();
          const bugPages = await Promise.all(bugUrls.map(fetchDocument));
          return bugPages.map(parseBugPage);
      }

      // 更新Bug时间单元格
      function updateBugTimeCells(bugData, colors) {
          $("tr th:nth-child(9)").text('Bug 留存').removeClass('text-center');
          $("tr td:nth-child(9)").each((idx, ele) => {
              const cell = $(ele).empty().html(`<span class="zm-mark">${bugData[idx].str}</span>`);
              const { h, processed } = bugData[idx];
              updateCellColor(cell, h, processed, colors);
          });
      }

      // 更新单元格颜色
      function updateCellColor(cell, h, processed, colors) {
          if (h < 12) cell.css({ color: colors.green });
          else if (h < 24) cell.css({ color: !processed ? colors.yellow : colors.green });
          else if (h < 34) cell.css({ color: !processed ? colors.brown : colors.yellow });
          else if (h < 70) cell.css({ color: !processed ? colors.red : colors.brown });
          else cell.css({ color: colors.red });
      }

      // 处理默认路径
      function handleDefaultPath(path) {
          if (/bug-view-\d+\.html/.test(path)) {
              setupBugDetailPage();
          } else if (/story-view-\d+.html/.test(path)) {
              setupStoryDetailPage();
          } else if (/resolvedbyme/.test(path)) {
              setupResolvedByMePage();
          } else if (/build-view-\d+.*\.html/.test(path)) {
              setupVersionBugPage()
              setupResolvedByMeBuildPage()
          } else if (/effort-createForObject-bug-\d+.html/.test(path)) {
              setupBugEffortPage()
          } else if (/effort-createForObject-task-\d+.html/.test(path)) {
              setupTaskEffortPage()
          } else if (/my\//.test(path)) {
            setupMyPageWorkHoursReminder()
          } else if (/effort-batchCreate-\d+\.html/.test(path)) {
            setupBatchEffortPage()
          } else if (!(/misc-checkUpdate|user-login|file-read|execution-task|my-work-task|effort-calendar|my-work-bug|effort-view|task-batchCreate|task-create|task-edit|task-view|task-cancel|user-deny-message-ajaxgetmessage|my-effort-all|effort-edit|effort-view|bug-view|effort-createForObject-bug|task-start|task-finish|task-recordEstimate|task-close|qa|task-activate|task-assignTo/.test(path))) {
            setupWorkHoursOverlay()
          }
          setupLeftMenu()
          // 全局工时强提醒（除特定页面外）
      }

      // 设置my页面工时提醒
      async function setupMyPageWorkHoursReminder() {
        try {
          // 等待页面加载完成
          await waitForContentInContainer('body', '.col-side');
          
          // 检查是否已存在提醒
          if ($('.zm-work-hours-reminder').length > 0) {
            return;
          }
          
          // 获取本周工时数据
          const weeklyData = await dataStrategies.fetch('weeklyWorkHours');
          if (weeklyData && weeklyData.hasInsufficientHours) {
            // 创建提醒div
            const reminderHtml = `
              <div class="panel zm-work-hours-reminder" style="margin-bottom: 20px; border: 2px solid #ff4d4f; background: #fff2f0;">
                <div class="panel-heading" style="background: #ff4d4f; color: white; padding: 10px 15px; font-weight: bold;">
                  <i class="icon icon-exclamation-triangle"></i> 工时提醒
                </div>
                <div class="panel-body" style="padding: 15px;">
                  <p style="margin: 0 0 10px 0; color: #ff4d4f; font-weight: bold;">
                    ⚠️ 近7天工时未填满！检测时间范围：${weeklyData.weekRange.start} 至 ${weeklyData.weekRange.end}
                  </p>
                  <div style="margin-top: 10px;">
                    <strong>未填满工时的日期：</strong>
                    <ul style="margin: 5px 0; padding-left: 20px;">
                      ${weeklyData.insufficientDays.map(day => 
                        `<li data-date="${day.date}" style="color: #ff4d4f; display: flex;  align-items: center; margin-bottom: 5px;">
                          <span>${day.date} - 已填写 ${day.hours}小时 / 需要8小时</span>
                          <button class="btn btn-xs btn-default zm-remove-reminder" data-date="${day.date}" style="margin-left: 10px;" title="删除此提醒（如请假、调休等）">
                            <i class="icon icon-close"></i>
                          </button>
                        </li>`
                      ).join('')}
                    </ul>
                  </div>
                  <div style="margin-top: 15px;">
                    <a href="/effort-calendar.html" class="btn btn-primary btn-sm">
                      <i class="icon icon-edit"></i> 立即填写工时
                    </a>
                    <button class="btn btn-default btn-sm" onclick="$(this).closest('.zm-work-hours-reminder').fadeOut()" style="margin-left: 10px;">
                      <i class="icon icon-close"></i> 关闭提醒
                    </button>
                  </div>
                </div>
              </div>
            `;
            
            // 插入到col-side的开头
            $('.col-side').prepend(reminderHtml);
            
            // 绑定删除按钮的点击事件
            $('.zm-remove-reminder').on('click', function() {
              const date = $(this).data('date');
              removeWorkHoursReminder(date);
            });
            
            console.log('(zm) 已在my页面添加工时提醒');
          } else {
            console.log('(zm) 本周工时已填满，无需提醒');
          }
        } catch (err) {
          console.error('(zm) 设置my页面工时提醒失败:', err);
        }
      }

      // 删除单个工时提醒的函数
      function removeWorkHoursReminder(date) {
        try {
          // 从localStorage中获取已删除的日期列表
          let removedDates = JSON.parse(localStorage.getItem('zm-removed-work-hours-dates') || '[]');
          
          // 添加当前日期到删除列表
          if (!removedDates.includes(date)) {
            removedDates.push(date);
            localStorage.setItem('zm-removed-work-hours-dates', JSON.stringify(removedDates));
          }
          
          // 使用data-date属性查找对应的li元素
          $(`li[data-date="${date}"]`).fadeOut(300, function() {
            $(this).remove();
            
            // 检查是否还有其他未填满的日期
            const remainingItems = $('.zm-work-hours-reminder li').length;
            if (remainingItems === 0) {
              // 如果没有其他项目了，隐藏整个提醒面板
              $('.zm-work-hours-reminder').fadeOut(300, function() {
                $(this).remove();
              });
            }
          });
          
          console.log(`(zm) 已删除 ${date} 的工时提醒`);
        } catch (err) {
          console.error('(zm) 删除工时提醒失败:', err);
        }
      }

      // 全屏强提醒遮罩
      async function setupWorkHoursOverlay() {
        try {
          // 技术实验室不用强制填写工时
          const userName = localStorage.getItem('zm-username');
          const usernameList = ['曾丽星', '刘池', '张垚', '唐金丽', '孙俊', '羿中引', '阮泽林', '马佳伟', '刘海军', '郭可奇', '艾相葵', '陈小虎', '吴悠', '周姚']
          if (usernameList.includes(userName)) {
            console.log('(zm) 技术实验室不用强制填写工时');
            return;
          }

          // 检查是否在排除的页面中
          if (/misc-checkUpdate|user-login|file-read|execution-task|my-work-task|effort-calendar|my-work-bug|effort-view|task-batchCreate|task-create|task-edit|task-view|task-cancel|user-deny-message-ajaxgetmessage|my-effort-all|effort-edit|effort-view|bug-view|effort-createForObject-bug|task-start|task-finish|task-recordEstimate|task-close|qa|task-activate|task-assignTo/.test(window.location.pathname)) {
            console.log('(zm) 当前页面不需要工时强提醒');
            return;
          }

          // 检查今天是否是工作日
          const today = new Date();
          
          // 检查是否是工作日（非调休）
          if (!workdayCn.isWorkday(today)) {
            console.log('(zm) 今天不是工作日，不显示工时强提醒');
            return;
          }

          // 检查是否已存在遮罩
          if ($('.zm-work-hours-overlay').length > 0) {
            return;
          }

          // 延迟执行，确保 dataStrategies 已初始化
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // 获取本周工时数据
          const weeklyData = await dataStrategies.fetch('weeklyWorkHours');
          
          // 获取已标记的请假日期
          const leaveDates = JSON.parse(localStorage.getItem('zm-leave-dates') || '[]');
          
          if (weeklyData && weeklyData.hasInsufficientHours) {
            // 创建全屏遮罩
            const overlayHtml = `
              <div class="zm-work-hours-overlay" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              ">
                <div class="zm-work-hours-modal" style="
                  background: white;
                  border-radius: 8px;
                  width: 100%;
                  height: 90vh;
                  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                  display: flex;
                  flex-direction: column;
                  overflow: hidden;
                ">
                  <!-- 顶部紧凑区域 -->
                  <div style="padding: 10px 20px; border-bottom: 1px solid #f0f0f0; flex-shrink: 0; background: linear-gradient(to bottom, #fafafa 0%, #ffffff 100%);">
                    <!-- 标题和按钮行 -->
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                      <div style="display: flex; align-items: center;">
                        <i class="icon icon-exclamation-sign" style="font-size: 24px; color: #ff4d4f; margin-right: 8px;"></i>
                        <h2 style="margin: 0; color: #ff4d4f; font-size: 16px; font-weight: bold;">
                          ⚠️ 工时填写提醒
                        </h2>
                        <span style="margin-left: 12px; color: #999; font-size: 11px;">
                          ${weeklyData.weekRange.start} ~ ${weeklyData.weekRange.end}
                        </span>
                        <button class="zm-toggle-sections" style="
                          background: none;
                          border: none;
                          color: #1890ff;
                          font-size: 12px;
                          cursor: pointer;
                          margin-left: 16px;
                          text-decoration: underline;
                          padding: 0;
                          transition: color 0.2s;
                        "
                        onmouseover="this.style.color='#40a9ff'"
                        onmouseout="this.style.color='#1890ff'">
                          [收起通知]
                        </button>
                      </div>
                      <button class="zm-close-overlay" style="
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border: none;
                        border-radius: 4px;
                        padding: 6px 16px;
                        cursor: pointer;
                        font-size: 13px;
                        color: white;
                        font-weight: bold;
                        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
                        transition: all 0.3s;
                      " 
                      onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.5)'" 
                      onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 8px rgba(102, 126, 234, 0.4)'"
                      title="填完后点这里">
                        <i class="icon icon-refresh"></i> 刷新检查
                      </button>
                    </div>
                    
                    <!-- 提醒文字 -->
                    <div class="zm-section-reminder" style="margin-bottom: 10px; padding: 10px 12px; background: #fff2f0; border-left: 4px solid #ff4d4f; border-radius: 4px;">
                      <div class="zm-section-content">
                        <p style="margin: 0 0 6px 0; color: #333; font-size: 13px; line-height: 1.6; font-weight: 500;">
                          我知道你经常忘记填工时 😅，虽然右上角已经加了红色卡片提醒，但一忙起来就容易忽略。所以这次直接上全屏遮罩，逼着你先把工时填了再说！
                        </p>
                        <p style="margin: 0; color: #ff4d4f; font-size: 12px; font-weight: bold;">
                          请不要尝试绕过弹框，因为会浪费你的开发时间。
                        </p>
                      </div>
                    </div>
                    
                    <!-- 信息行 -->
                    <div class="zm-section-tags" style="display: flex; gap: 10px; align-items: center; font-size: 12px; line-height: 1.5; flex-wrap: wrap; margin-bottom: 10px;">
                      <span style="padding: 5px 10px; background: #e6f7ff; color: #1890ff; border-radius: 4px; border-left: 3px solid #1890ff; white-space: nowrap;">
                        ⏳ 禅道页面加载慢，请耐心等待
                      </span>
                      <span style="padding: 5px 10px; background: #fff7e6; color: #d46b08; border-radius: 4px; border-left: 3px solid #ffa940; white-space: nowrap;">
                        💡 填完后点右上角刷新检查
                      </span>
                      <span style="padding: 5px 10px; background: #ffe7ba; color: #d48806; border-radius: 4px; white-space: nowrap;">
                        ⚠️ 不要在iframe内跳转
                      </span>
                      <span style="padding: 5px 10px; background: #fff7e6; color: #d46b08; border-radius: 4px; white-space: nowrap;">
                        ⏰ 弹框每日提醒
                      </span>
                    </div>
                    
                    <!-- 请假标记区域 -->
                    <div class="zm-section-leave" style="background: #f6ffed; padding: 10px 12px; border-radius: 4px; border-left: 4px solid #52c41a; margin-bottom: ${leaveDates.length > 0 ? '10px' : '0'};">
                      <div class="zm-section-content" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span style="color: #666; font-size: 12px;">未填满日期：</span>
                        ${weeklyData.insufficientDays.length > 0 ? weeklyData.insufficientDays.map(day => `
                          <label style="
                            display: inline-flex;
                            align-items: center;
                            padding: 4px 8px;
                            background: white;
                            border: 1px solid #d9d9d9;
                            border-radius: 3px;
                            cursor: pointer;
                            transition: all 0.2s;
                            font-size: 12px;
                          " class="zm-leave-checkbox-label">
                            <input type="checkbox" value="${day.date}" class="zm-leave-checkbox" style="
                              width: 14px;
                              height: 14px;
                              margin-right: 6px;
                              cursor: pointer;
                            ">
                            <span style="color: #333;">${day.date} (${day.hours}h)</span>
                          </label>
                        `).join('') : '<span style="color: #999; font-size: 12px;">暂无未填满日期</span>'}
                        ${weeklyData.insufficientDays.length > 0 ? `
                        <button class="zm-confirm-leave" style="
                          padding: 4px 12px;
                          background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                          border: none;
                          border-radius: 3px;
                          color: white;
                          font-size: 12px;
                          font-weight: bold;
                          cursor: pointer;
                          transition: all 0.3s;
                          margin-left: 8px;
                        "
                        onmouseover="this.style.transform='scale(1.05)'"
                        onmouseout="this.style.transform='scale(1)'">
                          <i class="icon icon-ok"></i> 确认标记
                        </button>
                        ` : ''}
                      </div>
                    </div>
                    
                    <!-- 已标记请假日期区域 -->
                    ${leaveDates.length > 0 ? `
                    <div class="zm-section-marked" style="background: #fff7e6; padding: 10px 12px; border-radius: 4px; border-left: 4px solid #faad14;">
                      <div class="zm-section-content" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        ${leaveDates.map(date => `
                          <button class="zm-unmark-leave" data-date="${date}" style="
                            display: inline-flex;
                            align-items: center;
                            padding: 4px 8px;
                            background: white;
                            border: 1px solid #faad14;
                            border-radius: 3px;
                            cursor: pointer;
                            transition: all 0.2s;
                            font-size: 12px;
                            color: #d48806;
                          "
                          onmouseover="this.style.background='#fff7e6'; this.style.borderColor='#ff4d4f'; this.style.color='#ff4d4f';"
                          onmouseout="this.style.background='white'; this.style.borderColor='#faad14'; this.style.color='#d48806';">
                            <i class="icon icon-remove" style="margin-right: 4px;"></i>
                            <span>${date}</span>
                          </button>
                        `).join('')}
                      </div>
                    </div>
                    ` : ''}
                  </div>
                  
                  <!-- Tab切换按钮 -->
                  <div style="padding: 5px 20px; background: #fafafa; border-bottom: 1px solid #e0e0e0; flex-shrink: 0;">
                    <div style="display: flex; gap: 6px;">
                      <button class="zm-tab-btn" data-tab="calendar" style="
                        padding: 4px 12px;
                        border: 1.5px solid #ff4d4f;
                        background: #ff4d4f;
                        color: white;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: all 0.3s;
                      ">
                        <i class="icon icon-calendar"></i> 日历
                      </button>
                      <button class="zm-tab-btn" data-tab="task" style="
                        padding: 4px 12px;
                        border: 1.5px solid #d9d9d9;
                        background: white;
                        color: #666;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: all 0.3s;
                      ">
                        <i class="icon icon-list-alt"></i> 任务
                      </button>
                      <button class="zm-tab-btn" data-tab="execution" style="
                        padding: 4px 12px;
                        border: 1.5px solid #d9d9d9;
                        background: white;
                        color: #666;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                        font-weight: bold;
                        transition: all 0.3s;
                      ">
                        <i class="icon icon-flag"></i> 执行
                      </button>
                    </div>
                  </div>
                  
                  <!-- iframe容器 -->
                  <div style="flex: 1; overflow: hidden; position: relative;">
                    <iframe id="zm-calendar-iframe" src="/effort-calendar.html" style="
                      width: 100%;
                      height: 100%;
                      border: none;
                      display: block;
                    "></iframe>
                    <iframe id="zm-task-iframe" src="/my-work-task.html" style="
                      width: 100%;
                      height: 100%;
                      border: none;
                      display: none;
                    "></iframe>
                    <iframe id="zm-execution-iframe" src="/execution-task.html" style="
                      width: 100%;
                      height: 100%;
                      border: none;
                      display: none;
                    "></iframe>
                  </div>
                </div>
              </div>
            `;
            
            // 插入到body中
            $('body').append(overlayHtml);
            
            // Tab切换功能
            $('.zm-tab-btn').on('click', function() {
              const tab = $(this).data('tab');
              
              // 更新按钮样式
              $('.zm-tab-btn').css({
                'background': 'white',
                'color': '#666',
                'border-color': '#d9d9d9'
              });
              
              // 根据不同tab设置不同颜色
              let bgColor = '#1890ff';
              if (tab === 'calendar') bgColor = '#ff4d4f';
              else if (tab === 'task') bgColor = '#1890ff';
              else if (tab === 'execution') bgColor = '#52c41a';
              
              $(this).css({
                'background': bgColor,
                'color': 'white',
                'border-color': bgColor
              });
              
              // 隐藏所有iframe
              $('#zm-calendar-iframe, #zm-task-iframe, #zm-execution-iframe').hide();
              
              // 显示对应的iframe
              if (tab === 'calendar') {
                $('#zm-calendar-iframe').show();
              } else if (tab === 'task') {
                $('#zm-task-iframe').show();
              } else if (tab === 'execution') {
                $('#zm-execution-iframe').show();
              }
            });
            
            // 刷新检查按钮
            $('.zm-close-overlay').on('click', function() {
              location.reload();
            });
            
            // 确认标记请假按钮
            $('.zm-confirm-leave').on('click', function() {
              const selectedDates = [];
              $('.zm-leave-checkbox:checked').each(function() {
                selectedDates.push($(this).val());
              });
              
              if (selectedDates.length === 0) {
                alert('请先选择需要标记的请假日期');
                return;
              }
              
              // 保存到localStorage
              const existingDates = JSON.parse(localStorage.getItem('zm-leave-dates') || '[]');
              const mergedDates = [...new Set([...existingDates, ...selectedDates])];
              localStorage.setItem('zm-leave-dates', JSON.stringify(mergedDates));
              
              console.log('(zm) 已标记请假日期:', selectedDates);
              
              // 刷新页面
              location.reload();
            });
            
            // 取消标记请假按钮
            $('.zm-unmark-leave').on('click', function() {
              const dateToRemove = $(this).data('date');
              
              // 从localStorage中移除
              const existingDates = JSON.parse(localStorage.getItem('zm-leave-dates') || '[]');
              const updatedDates = existingDates.filter(date => date !== dateToRemove);
              localStorage.setItem('zm-leave-dates', JSON.stringify(updatedDates));
              
              console.log('(zm) 已取消标记请假日期:', dateToRemove);
              
              // 刷新页面
              location.reload();
            });
            
            // 添加checkbox的hover效果
            GM_addStyle(`
              .zm-leave-checkbox-label:hover {
                border-color: #52c41a !important;
                background: #f6ffed !important;
              }
            `);
            
            // 统一收缩展开功能
            let sectionsCollapsed = false;
            $('.zm-toggle-sections').on('click', function() {
              const $allSections = $('.zm-section-reminder, .zm-section-tags, .zm-section-leave, .zm-section-marked');
              
              if (sectionsCollapsed) {
                // 展开
                $allSections.slideDown(200);
                $(this).text('[收起通知]');
                sectionsCollapsed = false;
              } else {
                // 收起
                $allSections.slideUp(200);
                $(this).text('[展开通知]');
                sectionsCollapsed = true;
              }
            });
            
            // 检查是否需要显示使用提示弹窗
            const hasSeenTips = localStorage.getItem('zm-work-hours-tips-seen');
            if (!hasSeenTips) {
              showWorkHoursTipsModal();
            }
            
            console.log('(zm) 已显示工时强提醒遮罩');
          } else {
            console.log('(zm) 本周工时已填满，无需强提醒');
          }
        } catch (err) {
          console.error('(zm) 设置工时强提醒遮罩失败:', err);
        }
      }

      // 显示请假日期标记弹窗
      function showLeaveDateModal(insufficientDays) {
        const leaveDateModalHtml = `
          <div class="zm-leave-modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 99999999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s;
          ">
            <div class="zm-leave-modal" style="
              background: white;
              border-radius: 12px;
              padding: 0;
              max-width: 450px;
              width: 90%;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              animation: slideUp 0.3s;
              overflow: hidden;
            ">
              <!-- 头部 -->
              <div style="
                background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                padding: 20px;
                text-align: center;
              ">
                <i class="icon icon-calendar" style="font-size: 48px; color: white;"></i>
                <h2 style="margin: 10px 0 0 0; color: white; font-size: 20px; font-weight: bold;">
                  📅 标记请假日期
                </h2>
              </div>
              
              <!-- 内容 -->
              <div style="padding: 25px;">
                <div style="background: #e6f7ff; padding: 12px; border-radius: 6px; border-left: 4px solid #1890ff; margin-bottom: 20px;">
                  <p style="margin: 0; color: #1890ff; font-size: 13px; line-height: 1.6;">
                    💡 <strong>说明：</strong>如果某天请假/调休/出差等不需要填工时，可以勾选相应日期。标记后该日期将不再提醒。
                  </p>
                </div>
                
                <div style="margin-bottom: 20px;">
                  <h3 style="margin: 0 0 12px 0; color: #333; font-size: 15px;">
                    请选择请假日期：
                  </h3>
                  <div class="zm-leave-dates" style="max-height: 300px; overflow-y: auto;">
                    ${insufficientDays.map(day => `
                      <label style="
                        display: flex;
                        align-items: center;
                        padding: 10px;
                        margin-bottom: 8px;
                        background: #fafafa;
                        border-radius: 6px;
                        cursor: pointer;
                        transition: all 0.2s;
                      " class="zm-leave-date-item">
                        <input type="checkbox" value="${day.date}" style="
                          width: 18px;
                          height: 18px;
                          margin-right: 12px;
                          cursor: pointer;
                        ">
                        <div style="flex: 1;">
                          <span style="font-weight: bold; color: #333;">${day.date}</span>
                          <span style="color: #999; font-size: 12px; margin-left: 8px;">已填 ${day.hours}h / 需要 8h</span>
                        </div>
                      </label>
                    `).join('')}
                  </div>
                </div>
                
                <div style="background: #fff7e6; padding: 10px; border-radius: 6px; margin-bottom: 20px;">
                  <p style="margin: 0; color: #d48806; font-size: 12px; line-height: 1.5;">
                    ⚠️ 标记后这些日期将从工时检查中排除，如果误标记可在localStorage中的"zm-leave-dates"中删除。
                  </p>
                </div>
                
                <!-- 按钮 -->
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                  <button class="zm-leave-cancel" style="
                    background: white;
                    border: 1px solid #d9d9d9;
                    border-radius: 6px;
                    padding: 8px 20px;
                    color: #666;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.3s;
                  "
                  onmouseover="this.style.borderColor='#40a9ff';this.style.color='#40a9ff'"
                  onmouseout="this.style.borderColor='#d9d9d9';this.style.color='#666'">
                    取消
                  </button>
                  <button class="zm-leave-confirm" style="
                    background: linear-gradient(135deg, #52c41a 0%, #73d13d 100%);
                    border: none;
                    border-radius: 6px;
                    padding: 8px 20px;
                    color: white;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(82, 196, 26, 0.3);
                    transition: all 0.3s;
                  "
                  onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 4px 12px rgba(82, 196, 26, 0.4)'"
                  onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 2px 8px rgba(82, 196, 26, 0.3)'">
                    <i class="icon icon-ok"></i> 确认标记
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
        
        $('body').append(leaveDateModalHtml);
        
        // label悬停效果
        $('.zm-leave-date-item').hover(
          function() {
            $(this).css('background', '#e6f7ff');
          },
          function() {
            $(this).css('background', '#fafafa');
          }
        );
        
        // 取消按钮
        $('.zm-leave-cancel').on('click', function() {
          $('.zm-leave-modal-overlay').fadeOut(300, function() {
            $(this).remove();
          });
        });
        
        // 确认按钮
        $('.zm-leave-confirm').on('click', function() {
          const selectedDates = [];
          $('.zm-leave-dates input[type="checkbox"]:checked').each(function() {
            selectedDates.push($(this).val());
          });
          
          if (selectedDates.length > 0) {
            // 获取已有的请假日期
            let leaveDates = JSON.parse(localStorage.getItem('zm-leave-dates') || '[]');
            
            // 合并并去重
            leaveDates = [...new Set([...leaveDates, ...selectedDates])];
            
            // 保存到localStorage
            localStorage.setItem('zm-leave-dates', JSON.stringify(leaveDates));
            
            console.log('(zm) 已标记请假日期:', selectedDates);
            
            // 显示成功提示并刷新
            $('.zm-leave-modal-overlay').fadeOut(300, function() {
              $(this).remove();
              // 刷新页面重新检查
              location.reload();
            });
          } else {
            alert('请至少选择一个日期');
          }
        });
      }

      // 显示工时提醒使用提示弹窗
      function showWorkHoursTipsModal() {
        const tipsModalHtml = `
          <div class="zm-tips-modal-overlay" style="
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: fadeIn 0.3s;
          ">
            <div class="zm-tips-modal" style="
              background: white;
              border-radius: 12px;
              padding: 0;
              max-width: 500px;
              width: 90%;
              box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
              animation: slideUp 0.3s;
              overflow: hidden;
            ">
              <!-- 头部 -->
              <div style="
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 20px;
                text-align: center;
              ">
                <i class="icon icon-info-sign" style="font-size: 48px; color: white;"></i>
                <h2 style="margin: 10px 0 0 0; color: white; font-size: 22px; font-weight: bold;">
                  📢 工时提醒使用说明
                </h2>
              </div>
              
              <!-- 内容 -->
              <div style="padding: 25px;">
                <div style="margin-bottom: 20px;">
                  <h3 style="margin: 0 0 12px 0; color: #ff4d4f; font-size: 16px; display: flex; align-items: center;">
                    <i class="icon icon-exclamation-triangle" style="margin-right: 8px;"></i>
                    重要提醒
                  </h3>
                  <div style="background: #fff2f0; padding: 15px; border-radius: 6px; border-left: 4px solid #ff4d4f;">
                    <p style="margin: 0 0 10px 0; color: #333; font-size: 14px; line-height: 1.8;">
                      我知道你经常忘记填工时 😅，虽然右上角已经加了红色卡片提醒，但一忙起来就容易忽略。所以这次直接上<strong>全屏遮罩</strong>，逼着你先把工时填了再说！
                    </p>
                    <p style="margin: 0; color: #ff4d4f; font-size: 13px; font-weight: bold;">
                      ⚠️ 请不要尝试绕过弹框，因为会浪费你的开发时间。
                    </p>
                  </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                  <h3 style="margin: 0 0 12px 0; color: #1890ff; font-size: 16px; display: flex; align-items: center;">
                    <i class="icon icon-lightbulb" style="margin-right: 8px;"></i>
                    使用注意事项
                  </h3>
                  <ul style="margin: 0; padding-left: 20px; color: #333; font-size: 13px; line-height: 2;">
                    <li><strong>弹框时机：</strong>只会在<span style="color: #52c41a; font-weight: bold;">工作日</span>提醒</li>
                    <li><strong style="color: #52c41a;">📅 请假标记：</strong>如果<span style="color: #52c41a; font-weight: bold;">请假/调休/出差</span>，可点击<strong>"标记请假"</strong>按钮，标记后该日期将不再提醒</li>
                    <li><strong>填写方式：</strong>可在弹窗内切换"日历"、"任务"、"执行"三个页面</li>
                    <li><strong style="color: #1890ff;">⏳ 页面加载：</strong>由于<span style="color: #1890ff; font-weight: bold;">禅道页面加载较慢</span>，iframe内容可能需要稍等一会才能显示，请耐心等待</li>
                    <li><strong style="color: #ff4d4f;">⚠️ 重要：</strong>请<strong>不要在iframe内跳转到其他页面</strong>，否则会出现iframe套iframe的问题</li>
                    <li><strong>完成后：</strong>填写完成后点击右上角<span style="color: #667eea; font-weight: bold;">"刷新检查"</span>按钮</li>
                    <li><strong>异常恢复：</strong>如果出现iframe嵌套问题，点击"刷新检查"即可恢复</li>
                  </ul>
                </div>
                
                <div style="background: #fffbe6; padding: 12px; border-radius: 6px; border-left: 4px solid #faad14; margin-bottom: 20px;">
                  <p style="margin: 0; color: #d48806; font-size: 12px; line-height: 1.6;">
                    💡 <strong>温馨提示：</strong>此说明只会显示一次。如需再次查看，请清除浏览器localStorage中的"zm-work-hours-tips-seen"。
                  </p>
                </div>
                
                <!-- 按钮 -->
                <div style="text-align: center;">
                  <button class="zm-tips-confirm" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 6px;
                    padding: 12px 40px;
                    color: white;
                    font-size: 15px;
                    font-weight: bold;
                    cursor: pointer;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                    transition: all 0.3s;
                  "
                  onmouseover="this.style.transform='scale(1.05)';this.style.boxShadow='0 6px 16px rgba(102, 126, 234, 0.6)'"
                  onmouseout="this.style.transform='scale(1)';this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.4)'">
                    <i class="icon icon-ok"></i> 我知道了，开始填写工时
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <style>
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideUp {
              from { 
                opacity: 0;
                transform: translateY(30px);
              }
              to { 
                opacity: 1;
                transform: translateY(0);
              }
            }
          </style>
        `;
        
        $('body').append(tipsModalHtml);
        
        // 确认按钮点击事件
        $('.zm-tips-confirm').on('click', function() {
          // 保存到localStorage
          localStorage.setItem('zm-work-hours-tips-seen', 'true');
          // 移除弹窗
          $('.zm-tips-modal-overlay').fadeOut(300, function() {
            $(this).remove();
          });
          console.log('(zm) 用户已确认工时提醒使用说明');
        });
      }

      async function setupLeftMenu() {
        const element = await waitForContentInContainer('body', '#menuMainNav')
        const myBug = $('<li><a href="/my-work-bug.html" class="show-in-app"><i class="icon icon-bug"></i><span class="text num">我的Bug</span></a></li>');
        const myTask = $('<li><a href="/my-work-task.html" class="show-in-app"><i class="icon icon-list-alt"></i><span class="text num">我的任务</span></a></li>');
        const zenGuard = $('<li><a class="show-in-app"><i class="icon icon-magic"></i><span class="text num">禅道卫士</span></a></li>');

        myBug.click(function () {
            window.location.href = '/my-work-bug.html';
        });
        myTask.click(function () {
            window.location.href = '/my-work-task.html';
        });
        zenGuard.click(function () {
            window.open('http://172.21.15.106:8090/')
        })

        $('#menuMainNav .divider').before(myBug, myTask, zenGuard);
    }

      // PostMessage listener: 接收 iframe 中的刷新请求并由父页面执行刷新
      (function setupZMDockPostMessageListener() {
        try {
          if (window.__zm_postMessageListenerBound) return;
          window.__zm_postMessageListenerBound = true;
          window.addEventListener('message', function (ev) {
            try {
              const data = ev.data || {};
              if (data.__zdh_action !== 'refresh-bug-view') return;
              console.log('(zm) 收到 postMessage 请求刷新 Bug 详情页', data);
              // 收起/隐藏快捷区（兼容内联/悬浮两种 UI）
              try { $('#zm-bug-inline-panel').hide(); } catch (e) {}
              try { $('#zm-bug-quick-dock').addClass('collapsed').hide(); } catch (e) {}
              try { $('#zm-bug-dock-launcher').show(); } catch (e) {}
              setTimeout(function () { location.reload(); }, 120);
            } catch (err) {
              console.warn('(zm) postMessage 处理失败', err);
            }
          }, false);
        } catch (err) {
          console.warn('(zm) 初始化 postMessage 监听失败', err);
        }
      })();

      // Bug详情页悬浮快捷区（日志/指派/解决）
      function setupBugQuickActionDock() {
          const isIframePage = window.self !== window.top;

          if ($('#zm-bug-quick-dock').length > 0 || $('#zm-bug-inline-panel').length > 0) {
            console.info('(zm) Bug快捷区已存在，跳过重复初始化');
              return;
          }

          const rawActions = [
              {
                  key: 'effort',
                  title: '日志',
                  icon: 'icon-time',
                  link: $('a.effort.iframe[href*="/effort-createForObject-bug-"]').first()
              },
              {
                  key: 'assign',
                  title: '指派',
                  icon: 'icon-hand-right',
                  link: $('a.iframe[href*="/bug-assignTo-"]').first()
              },
              {
                  key: 'resolve',
                  title: '解决',
                  icon: 'icon-checked',
                  link: $('a.iframe[href*="/bug-resolve-"]').first()
              }
          ];

          const actions = rawActions
              .map(item => ({ ...item, href: item.link && item.link.attr('href') }))
              .filter(item => item.link && item.link.length > 0 && item.href);

          if (actions.length === 0) {
              console.warn('(zm) Bug快捷区跳过: 未找到日志/指派/解决链接', {
                effort: rawActions[0].link.length,
                assign: rawActions[1].link.length,
                resolve: rawActions[2].link.length,
                path: location.pathname
              });
              return;
          }

          const lastActiveKey = localStorage.getItem('zm-bug-dock-active');
          const activeKey = actions.some(item => item.key === lastActiveKey) ? lastActiveKey : actions[0].key;

            // Helper: 在给定 document 上增强“解决方案”选择的展示（将每种方案标注为哪个角色填写）
            function enhanceResolveFormInDocument(doc) {
              try {
                if (!doc) return;
                const body = doc.body || doc;

                // 优先处理 chosen 容器（常见于禅道UI）
                const chosen = body.querySelector('.m-bug-resolve .chosen-container') || body.querySelector('.chosen-container');
                if (chosen && !chosen.dataset.zmResolveEnhanced) {
                  chosen.dataset.zmResolveEnhanced = '1';
                  chosen.addEventListener('click', () => {
                    const lis = chosen.querySelectorAll('li');
                    lis.forEach(node => {
                      try {
                        const txt = node.textContent.trim();
                        const replaced = getOwner(txt) || txt;
                        // 选项里允许 HTML（chosen 的 li 支持），所以直接替换 innerHTML
                        node.innerHTML = replaced;
                        node.title = replaced.replace(/<span style="color: .*;">|<\/span>/g, '');
                      } catch (e) {}
                    });
                  });
                }

                // 如果没有 chosen，则尝试处理普通的 select
                const sel = body.querySelector('select[name="resolution"], select[name="resolveType"], select#resolveType');
                if (sel && !sel.dataset.zmResolveEnhanced) {
                  sel.dataset.zmResolveEnhanced = '1';
                  const updateOptions = () => {
                    Array.from(sel.options).forEach(opt => {
                      try {
                        const txt = opt.text.trim();
                        const replaced = getOwner(txt) || txt;
                        // option 不支持 HTML，放入 title 作为提示
                        opt.title = replaced.replace(/<span style=\"color: .*;\">|<\/span>/g, '');
                        // 显示文本保持可读性（去掉标签）
                        opt.text = opt.title;
                      } catch (e) {}
                    });
                  };
                  updateOptions();
                  // 观察子节点以防 JS 插件异步渲染
                  const mo = new MutationObserver(updateOptions);
                  mo.observe(sel, { childList: true, subtree: true });
                }
              } catch (err) {
                console.warn('(zm) enhanceResolveFormInDocument 失败', err);
              }
            }

            // Helper: 在 iframe 中增强 resolve 表单（安全尝试并监听延迟渲染）
            function enhanceResolveFormInIframe(iframe) {
              try {
                if (!iframe || !iframe.contentDocument) return;
                const doc = iframe.contentDocument;
                enhanceResolveFormInDocument(doc);

                // 如果页面稍后才渲染相关控件，观察 body
                try {
                  const observer = new MutationObserver((mutations, obs) => {
                    if (doc.querySelector('.m-bug-resolve') || doc.querySelector('.chosen-container') || doc.querySelector('select[name="resolution"], select[name="resolveType"], select#resolveType')) {
                      enhanceResolveFormInDocument(doc);
                      obs.disconnect();
                    }
                  });
                  if (doc.body) observer.observe(doc.body, { childList: true, subtree: true });
                } catch (e) { /* ignore */ }
              } catch (err) {
                // 可能跨域，忽略
              }
            }

            let inlinePanelRef = null;
            let dockRef = null;
            let launcherRef = null;

            const closeQuickDockUI = () => {
              if (inlinePanelRef && inlinePanelRef.length) {
                inlinePanelRef.hide();
              }
              if (dockRef && dockRef.length) {
                dockRef.addClass('collapsed').hide();
              }
              if (launcherRef && launcherRef.length) {
                launcherRef.show();
              }
            };

            // 保存成功后自动刷新当前Bug详情页（兼容内联/悬浮两种快捷区）
            let hasTriggeredBugPageRefresh = false;
            const reloadOuterWindow = (sourceLabel) => {
              try {
                // 如果当前在 iframe 内，尝试让顶层窗口直接 reload（同源时可行）
                if (window.top && window.top !== window) {
                  try {
                    window.top.location.reload();
                    return;
                  } catch (err) {
                    // 如果跨域无法访问 location，则使用 postMessage 通知顶层去刷新
                    try {
                      window.top.postMessage({ __zdh_action: 'refresh-bug-view', source: sourceLabel || 'iframe' }, '*');
                      return;
                    } catch (e) {
                      // 忽略，继续 fallback
                    }
                  }
                }
              } catch (e) {
                // ignore
              }
              // 兜底：刷新当前窗口
              try { location.reload(); } catch (e) { console.warn('(zm) 无法执行 reload', e); }
            };

            const tryRefreshBugPageFromIframe = (iframe, sourceLabel) => {
              if (hasTriggeredBugPageRefresh) return;

              try {
                const frameWin = iframe.contentWindow;
                const frameDoc = iframe.contentDocument;
                const path = frameWin?.location?.pathname || '';
                const href = frameWin?.location?.href || '';

                const returnedToBugView = /bug-view-\d+\.html/.test(path) || /module=bug&method=view/.test(href);
                const saveSuccessInForm = /\/(bug-assignTo-|bug-resolve-|effort-createForObject-bug-)/.test(path)
                && !!frameDoc?.querySelector('.alert-success, .result-success, .text-success');

                if (returnedToBugView || saveSuccessInForm) {
                  hasTriggeredBugPageRefresh = true;
                  console.log(`(zm) 检测到${sourceLabel}保存完成，自动刷新Bug详情页`);
                  closeQuickDockUI();
                  setTimeout(() => reloadOuterWindow(sourceLabel), 120);
                }
              } catch (err) {
                // 忽略跨文档读取异常
              }
            };

            const bindRefreshWatcherForSaveButton = (iframe, sourceLabel) => {
              try {
                const frameDoc = iframe.contentDocument;
                const frameWin = iframe.contentWindow;
                const path = frameWin?.location?.pathname || '';
                const isTargetFormPage = /\/(bug-assignTo-|bug-resolve-|effort-createForObject-bug-)/.test(path);
                if (!frameDoc || !isTargetFormPage) return;

                const bindKey = `${sourceLabel}:${path}`;
                if (iframe.dataset.zmSubmitWatchKey === bindKey) {
                  return;
                }
                iframe.dataset.zmSubmitWatchKey = bindKey;

                let hasSaveIntent = false;

                const markSaveIntent = () => {
                  hasSaveIntent = true;
                  // 避免长期保留旧意图
                  setTimeout(() => {
                    hasSaveIntent = false;
                  }, 15000);
                };

                const triggerRefresh = () => {
                  if (hasTriggeredBugPageRefresh) return;
                  hasTriggeredBugPageRefresh = true;
                  console.log(`(zm) 检测到${sourceLabel}保存按钮变为disabled，自动刷新Bug详情页`);
                  closeQuickDockUI();
                  setTimeout(() => reloadOuterWindow(sourceLabel), 160);
                };

                const bindButtonObserver = (submitBtn) => {
                  if (!submitBtn || submitBtn.dataset.zmDisabledObserverBound === '1') {
                    return;
                  }

                  submitBtn.dataset.zmDisabledObserverBound = '1';

                  const checkDisabledAndRefresh = () => {
                    const disabled = submitBtn.disabled || submitBtn.getAttribute('disabled') !== null;
                    if (hasSaveIntent && disabled) {
                      triggerRefresh();
                    }
                  };

                  // 提交后按钮通常会被置灰，监听属性变化可稳定捕获
                  const btnObserver = new MutationObserver(checkDisabledAndRefresh);
                  btnObserver.observe(submitBtn, {
                    attributes: true,
                    attributeFilter: ['disabled', 'class', 'aria-disabled', 'data-loading']
                  });

                  // 兜底轮询，覆盖某些框架不触发 mutation 的场景
                  const pollId = setInterval(() => {
                    if (hasTriggeredBugPageRefresh) {
                      clearInterval(pollId);
                      return;
                    }
                    checkDisabledAndRefresh();
                  }, 200);

                  setTimeout(() => clearInterval(pollId), 15000);
                };

                const findSubmitButton = () => frameDoc.querySelector('#submit, button[type="submit"]');

                const bindIfPossible = () => {
                  const submitBtn = findSubmitButton();
                  if (submitBtn) {
                    bindButtonObserver(submitBtn);
                  }
                };

                frameDoc.addEventListener('click', (event) => {
                  const targetBtn = event.target?.closest?.('#submit, button[type="submit"]');
                  if (targetBtn) {
                    markSaveIntent();
                    closeQuickDockUI();
                    bindButtonObserver(targetBtn);
                  }
                }, true);

                frameDoc.addEventListener('submit', () => {
                  markSaveIntent();
                  closeQuickDockUI();
                  bindIfPossible();
                }, true);

                // 页面结构可能异步渲染，监听节点变化后补绑
                const docObserver = new MutationObserver(bindIfPossible);
                if (frameDoc.body) {
                  docObserver.observe(frameDoc.body, { childList: true, subtree: true });
                }

                bindIfPossible();
              } catch (err) {
                // 忽略跨文档读取异常
              }
            };

            // 在指定 document 中增强解决方案下拉/列表的展示（告知每种解决方案是哪个角色填）
            const augmentResolveInDocument = (doc) => {
              try {
                if (!doc) return;
                const resolveRoot = doc.querySelector('.m-bug-resolve') || doc;

                const updateOptions = () => {
                  try {
                    // 支持 chosen 插件渲染的 li，也支持原生 select/option
                    const lis = resolveRoot.querySelectorAll('.chosen-drop .chosen-results li, .chosen-results li');
                    lis.forEach(node => {
                      const raw = node.textContent.trim();
                      const html = getOwner(raw);
                      if (html) {
                        node.innerHTML = html;
                        node.title = html.replace(/<span style="color: .*;">|<\/span>/g, '');
                      }
                    });

                    const opts = resolveRoot.querySelectorAll('select option');
                    opts.forEach(opt => {
                      const raw = opt.textContent.trim();
                      const html = getOwner(raw).replace(/<[^>]+>/g, '');
                      opt.textContent = html;
                      opt.title = html;
                    });
                  } catch (e) {
                    // ignore
                  }
                };

                // 绑定点击/展示时更新
                const containers = resolveRoot.querySelectorAll('.chosen-container, .chosen, .chosen-results');
                containers.forEach(c => {
                  if (c.__zm_owner_bound) return;
                  c.__zm_owner_bound = true;
                  c.addEventListener('click', () => setTimeout(updateOptions, 50));
                });

                // 直接尝试一次更新（用于已经渲染好的场景）
                setTimeout(updateOptions, 200);
              } catch (err) {
                console.warn('(zm) augmentResolveInDocument failed', err);
              }
            };

            // 在执行某个动作前检查是否需要先填工时（needEffort），如果需要则优先打开日志（尽量触发页面原始 a.effort），否则执行回调
            const doActionWithEffortCheck = (actionKey, proceed) => {
              try {
                const parsed = parseBugPage();
                if (parsed && parsed.needEffort) {
                  console.log('(zm) detect needEffort before', actionKey);
                  // 优先尝试点击页面上原始的 a.effort 链接（若还存在）
                  const nativeEffort = document.querySelector('a.effort') || (actions.find(a => a.key === 'effort') || {}).link || (actions.find(a => a.key === 'effort') || {}).replacedLink;
                  if (nativeEffort) {
                    try {
                      // 支持原生 click 或 jQuery 元素
                      if (nativeEffort.click) nativeEffort.click();
                      else $(nativeEffort).trigger('click');
                    } catch (err) {
                      try { $(nativeEffort).trigger('click'); } catch (e) {}
                    }
                    return;
                  }

                  // 如果找不到原始链接，尝试切换到内联/悬浮的日志 tab
                  try {
                    if (inlinePanelRef && inlinePanelRef.length) {
                      // 显示并切换到日志 tab
                      if (typeof switchInlineTab === 'function') switchInlineTab('effort');
                      if (typeof showInlinePanel === 'function') showInlinePanel('effort');
                      else toggleInlinePanel && toggleInlinePanel('effort');
                      return;
                    }
                    if (dockRef && dockRef.length) {
                      showDock && showDock();
                      switchTab && switchTab('effort');
                      return;
                    }
                  } catch (err) {
                    // ignore and fallthrough
                  }
                }
              } catch (err) {
                console.warn('(zm) doActionWithEffortCheck error', err);
              }

              // 默认执行动作
              try { proceed && proceed(); } catch (err) { console.warn('(zm) action proceed failed', err); }
            };

          // iframe页使用内联快捷区（放在日志/指派/解决按钮左侧）
          if (isIframePage) {
              GM_addStyle(`
                #zm-bug-inline-panel {
                  display: none;
                  position: fixed;
                  width: min(1180px, calc(100vw - 16px));
                  border: 1px solid #d9d9d9;
                  border-radius: 8px;
                  background: #fff;
                  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
                  overflow: hidden;
                  min-height: 320px;
                  z-index: 999996;
                }

                #zm-bug-inline-panel .zm-inline-header {
                  height: 34px;
                  padding: 0 10px;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  border-bottom: 1px solid #eee;
                  background: #fafafa;
                  font-size: 12px;
                }

                #zm-bug-inline-panel .zm-inline-header-actions {
                  display: flex;
                  align-items: center;
                  gap: 8px;
                }

                #zm-bug-inline-panel .zm-inline-header-actions a {
                  cursor: pointer;
                  color: #666;
                  text-decoration: none;
                }

                #zm-bug-inline-panel .zm-inline-pane {
                  display: none;
                  height: 600px;
                }

                #zm-bug-inline-panel .zm-inline-pane.active {
                  display: block;
                }

                #zm-bug-inline-panel .zm-inline-pane iframe {
                  width: 100%;
                  height: 100%;
                  border: 0;
                }
              `);

              actions.forEach(item => {
                const clonedLink = item.link.clone(false);
                clonedLink
                  .removeAttr('target data-toggle data-width data-height data-remote data-load')
                  .attr('href', 'javascript:void(0)')
                  .attr('data-zm-inline-key', item.key)
                  .attr('title', `${item.title}（已接入下方快捷区）`);

                // 先原位插入新按钮，再删除旧按钮，保证位置和原样式不变
                item.link.after(clonedLink);
                item.replacedLink = clonedLink;
              });

              const inlinePanelBodyHtml = actions.map(item => `
                <div class="zm-inline-pane${item.key === activeKey ? ' active' : ''}" data-key="${item.key}">
                  <iframe src="${item.href}" loading="eager"></iframe>
                </div>
              `).join('');

              const inlinePanel = $(`
                <div id="zm-bug-inline-panel">
                  <div class="zm-inline-header">
                    <span>Bug快捷操作</span>
                    <div class="zm-inline-header-actions">
                      <a href="javascript:void(0)" id="zm-bug-inline-collapse">收起</a>
                    </div>
                  </div>
                  ${inlinePanelBodyHtml}
                </div>
              `);
              inlinePanelRef = inlinePanel;

                inlinePanel.find('iframe').on('load', function () {
                  tryRefreshBugPageFromIframe(this, '内联快捷区');
                  bindRefreshWatcherForSaveButton(this, '内联快捷区');
                  try { enhanceResolveFormInIframe(this); } catch (e) {}
                });

                // 基于 .main-actions .btn-toolbar 增加专用展开/收起按钮
                const rightToolbar = $('.main-actions .btn-toolbar').first();
                const toggleClassName = (actions[0].replacedLink && actions[0].replacedLink.attr('class')) || 'btn';
                const inlineToggleBtn = $(`<a href="javascript:void(0)" id="zm-bug-inline-toggle" class="${toggleClassName}" title="展开/收起快捷窗">快捷窗</a>`);
                if (rightToolbar.length > 0) {
                  rightToolbar.append(inlineToggleBtn);
                } else if (actions[actions.length - 1]?.replacedLink?.length) {
                  actions[actions.length - 1].replacedLink.after(inlineToggleBtn);
                }

                if (rightToolbar.length > 0) {
                  $('body').append(inlinePanel);
                } else {
                  $('body').append(inlinePanel);
                }

                // 新按钮插入完成后，再删除原始a按钮，避免触发禅道原弹层
                actions.forEach(item => item.link.remove());

              const switchInlineTab = (key) => {
                  inlinePanel.find('.zm-inline-pane').removeClass('active');
                  inlinePanel.find(`.zm-inline-pane[data-key="${key}"]`).addClass('active');
                  localStorage.setItem('zm-bug-dock-active', key);
              };

                const updatePanelPosition = () => {
                  const anchor = $('.main-actions .btn-toolbar').first();
                  if (!anchor.length || !inlinePanel.is(':visible')) return;

                  const panelEl = inlinePanel[0];
                  const anchorRect = anchor[0].getBoundingClientRect();
                  const panelWidth = panelEl.offsetWidth || Math.min(window.innerWidth - 16, 760);
                  const panelHeight = panelEl.offsetHeight || 500;

                  const left = Math.max(8, Math.min(anchorRect.right - panelWidth, window.innerWidth - panelWidth - 8));
                  let top = anchorRect.top - panelHeight - 8;
                  if (top < 8) {
                  top = Math.min(window.innerHeight - panelHeight - 8, anchorRect.bottom + 8);
                  }

                  inlinePanel.css({ left: `${left}px`, top: `${Math.max(8, top)}px` });
                };

                const showInlinePanel = (key) => {
                  if (key) {
                  switchInlineTab(key);
                  }
                  inlinePanel.show();
                  inlinePanel.find('#zm-bug-inline-collapse').text('收起');
                  updatePanelPosition();
                };

                const toggleInlinePanel = (key) => {
                  const currentActiveKey = inlinePanel.find('.zm-inline-pane.active').data('key');
                  const sameTab = key && currentActiveKey === key;
                  if (inlinePanel.is(':visible') && (sameTab || !key)) {
                  inlinePanel.hide();
                  inlinePanel.find('#zm-bug-inline-collapse').text('展开');
                  return;
                  }
                  showInlinePanel(key || currentActiveKey || activeKey);
                };

                switchInlineTab(activeKey);
                $(window).on('resize.zmBugInline scroll.zmBugInline', updatePanelPosition);

              actions.forEach(item => {
                  item.replacedLink.on('click.zmBugDock', function (e) {
                      e.preventDefault();
                      e.stopPropagation();
                    try {
                      const { needEffort } = parseBugPage() || {};
                      if (needEffort && item.key !== 'effort') {
                        // 如果需要先填写日志，切换到日志面板
                        showInlinePanel('effort');
                        console.info('(zm) 检测到未填写日志，已切换到 日志 面板');
                        return;
                      }
                    } catch (err) {}
                    toggleInlinePanel(item.key);
                  });
              });

                inlinePanel.find('#zm-bug-inline-collapse').on('click', function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleInlinePanel();
                });

                $('#zm-bug-inline-toggle').on('click.zmBugDock', function (e) {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleInlinePanel();
                });

                // ensure resolve form augmentation when dock iframes load
                inlinePanel.find('iframe').each(function() {
                  try { enhanceResolveFormInIframe(this); } catch (e) {}
                });

              console.log('(zm) 已启用Bug详情页内联快捷区(iframe)');
              return;
          }

          GM_addStyle(`
            #zm-bug-quick-dock.zm-bug-dock {
              position: fixed;
              right: 16px;
              bottom: 16px;
              width: min(560px, calc(100vw - 24px));
              height: min(560px, 72vh);
              background: #fff;
              border: 1px solid #d9d9d9;
              border-radius: 10px;
              box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
              z-index: 999999;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }

            #zm-bug-quick-dock.zm-bug-dock.dragging {
              opacity: 0.92;
            }

            #zm-bug-quick-dock .zm-bug-dock-header {
              height: 42px;
              padding: 0 12px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: linear-gradient(135deg, #1f4ea3 0%, #3268be 100%);
              color: #fff;
              cursor: move;
              user-select: none;
            }

            #zm-bug-quick-dock .zm-bug-dock-title {
              display: flex;
              align-items: center;
              font-size: 13px;
              font-weight: bold;
              letter-spacing: 0.3px;
            }

            #zm-bug-quick-dock .zm-bug-dock-title .icon {
              margin-right: 6px;
            }

            #zm-bug-quick-dock .zm-bug-dock-controls {
              display: flex;
              align-items: center;
              gap: 10px;
            }

            #zm-bug-quick-dock .zm-bug-dock-controls .icon {
              cursor: pointer;
              font-size: 13px;
              opacity: 0.88;
              transition: opacity 0.2s;
            }

            #zm-bug-quick-dock .zm-bug-dock-controls .icon:hover {
              opacity: 1;
            }

            #zm-bug-quick-dock .zm-bug-dock-tabs {
              display: flex;
              border-bottom: 1px solid #e8e8e8;
              background: #fafafa;
              flex-shrink: 0;
            }

            #zm-bug-quick-dock .zm-bug-dock-tab {
              flex: 1;
              border: none;
              border-right: 1px solid #ededed;
              background: transparent;
              color: #666;
              height: 38px;
              font-size: 13px;
              cursor: pointer;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
            }

            #zm-bug-quick-dock .zm-bug-dock-tab:last-child {
              border-right: none;
            }

            #zm-bug-quick-dock .zm-bug-dock-tab:hover {
              background: #f0f5ff;
              color: #1f4ea3;
            }

            #zm-bug-quick-dock .zm-bug-dock-tab.active {
              background: #fff;
              color: #1f4ea3;
              font-weight: bold;
              box-shadow: inset 0 -2px 0 #1f4ea3;
            }

            #zm-bug-quick-dock .zm-bug-dock-body {
              position: relative;
              flex: 1;
              min-height: 220px;
              background: #fff;
            }

            #zm-bug-quick-dock .zm-bug-dock-pane {
              display: none;
              position: absolute;
              inset: 0;
            }

            #zm-bug-quick-dock .zm-bug-dock-pane.active {
              display: block;
            }

            #zm-bug-quick-dock .zm-bug-dock-pane iframe {
              width: 100%;
              height: 100%;
              border: 0;
              background: #fff;
            }

            #zm-bug-quick-dock .zm-bug-dock-loading {
              display: none;
              position: absolute;
              inset: 0;
              background: rgba(255, 255, 255, 0.84);
              align-items: center;
              justify-content: center;
              color: #1f4ea3;
              font-size: 13px;
              font-weight: bold;
            }

            #zm-bug-quick-dock .zm-bug-dock-pane.loading .zm-bug-dock-loading {
              display: flex;
            }

            #zm-bug-quick-dock.collapsed {
              width: 220px;
              height: 42px;
            }

            #zm-bug-quick-dock.collapsed .zm-bug-dock-tabs,
            #zm-bug-quick-dock.collapsed .zm-bug-dock-body {
              display: none;
            }

            #zm-bug-dock-launcher {
              position: fixed;
              right: 16px;
              bottom: 16px;
              height: 40px;
              padding: 0 14px;
              border: 0;
              border-radius: 20px;
              background: linear-gradient(135deg, #1f4ea3 0%, #3268be 100%);
              color: #fff;
              cursor: pointer;
              box-shadow: 0 6px 14px rgba(31, 78, 163, 0.35);
              z-index: 999998;
              font-size: 13px;
              font-weight: bold;
              display: none;
            }

            #zm-bug-dock-launcher:hover {
              filter: brightness(1.05);
            }

            @media (max-width: 1100px) {
              #zm-bug-quick-dock.zm-bug-dock {
                right: 8px;
                bottom: 8px;
                width: calc(100vw - 16px);
                height: 68vh;
              }

              #zm-bug-dock-launcher {
                right: 8px;
                bottom: 8px;
              }
            }
          `);

          const tabsHtml = actions.map(item => `
            <button type="button" class="zm-bug-dock-tab${item.key === activeKey ? ' active' : ''}" data-key="${item.key}">
              <i class="icon ${item.icon}"></i>${item.title}
            </button>
          `).join('');

          const panesHtml = actions.map(item => `
            <div class="zm-bug-dock-pane${item.key === activeKey ? ' active loading' : ''}" data-key="${item.key}">
              <iframe data-src="${item.href}" src="${item.key === activeKey ? item.href : 'about:blank'}" loading="eager"></iframe>
              <div class="zm-bug-dock-loading">${item.title}加载中...</div>
            </div>
          `).join('');

          const dock = $(`
            <div id="zm-bug-quick-dock" class="zm-bug-dock">
              <div class="zm-bug-dock-header">
                <div class="zm-bug-dock-title"><i class="icon icon-magic"></i><span>Bug快捷操作</span></div>
                <div class="zm-bug-dock-controls">
                  <i class="icon icon-refresh zm-bug-dock-refresh" title="刷新当前"></i>
                  <i class="icon icon-minus zm-bug-dock-collapse" title="收起/展开"></i>
                  <i class="icon icon-close zm-bug-dock-close" title="隐藏"></i>
                </div>
              </div>
              <div class="zm-bug-dock-tabs">${tabsHtml}</div>
              <div class="zm-bug-dock-body">${panesHtml}</div>
            </div>
          `).appendTo('body');
          dockRef = dock;

          const launcher = $('<button type="button" id="zm-bug-dock-launcher">Bug快捷操作</button>').appendTo('body');
          launcherRef = launcher;

          const buildFrameSrc = (src, force = false) => {
              if (!force) {
                  return src;
              }
              const separator = src.includes('?') ? '&' : '?';
              return `${src}${separator}_=${Date.now()}`;
          };

          const loadFrame = (key, force = false) => {
              const pane = dock.find(`.zm-bug-dock-pane[data-key="${key}"]`);
              if (!pane.length) return;

              const iframe = pane.find('iframe');
              const src = iframe.attr('data-src');
              if (!src) return;

              const currentSrc = iframe.attr('src');
              if (!force && currentSrc && currentSrc !== 'about:blank') {
                  return;
              }

              pane.addClass('loading');
              iframe.attr('src', buildFrameSrc(src, force));
          };

          const switchTab = (key) => {
              dock.find('.zm-bug-dock-tab').removeClass('active');
              dock.find(`.zm-bug-dock-tab[data-key="${key}"]`).addClass('active');
              dock.find('.zm-bug-dock-pane').removeClass('active');
              dock.find(`.zm-bug-dock-pane[data-key="${key}"]`).addClass('active');
              loadFrame(key);
              localStorage.setItem('zm-bug-dock-active', key);
          };

          const showDock = () => {
              dock.show().removeClass('collapsed');
              launcher.hide();
          };

          dock.find('iframe').on('load', function () {
              $(this).closest('.zm-bug-dock-pane').removeClass('loading');
              tryRefreshBugPageFromIframe(this, '悬浮快捷区');
              bindRefreshWatcherForSaveButton(this, '悬浮快捷区');
          });

          dock.find('.zm-bug-dock-tab').on('click', function () {
              switchTab($(this).data('key'));
          });

          dock.find('.zm-bug-dock-refresh').on('click', function (e) {
              e.stopPropagation();
              const currentKey = dock.find('.zm-bug-dock-tab.active').data('key');
              if (currentKey) {
                  loadFrame(currentKey, true);
              }
          });

          dock.find('.zm-bug-dock-collapse').on('click', function (e) {
              e.stopPropagation();
              dock.toggleClass('collapsed');
          });

          dock.find('.zm-bug-dock-close').on('click', function (e) {
              e.stopPropagation();
              dock.hide();
              launcher.show();
          });

          launcher.on('click', function () {
              showDock();
          });

          actions.forEach((item, idx) => {
              item.link.attr('title', `${item.title}（已接入悬浮快捷区）`);
              item.link.on('click.zmBugDock', function (e) {
                e.preventDefault();
                e.stopPropagation();
                // 在触发悬浮区前先做工时检查
                doActionWithEffortCheck(item.key, function() {
                showDock();
                switchTab(item.key);
                });
              });

              if (item.key !== activeKey) {
                  setTimeout(() => loadFrame(item.key), 350 + idx * 350);
              }
          });

          // 允许拖动位置，避免遮挡原始页面内容
          let isDragging = false;
          let startX = 0;
          let startY = 0;
          let startLeft = 0;
          let startTop = 0;

          dock.find('.zm-bug-dock-header').on('pointerdown', function (e) {
              if ($(e.target).closest('.zm-bug-dock-controls').length > 0) {
                  return;
              }

              const rect = dock[0].getBoundingClientRect();
              isDragging = true;
              startX = e.clientX;
              startY = e.clientY;
              startLeft = rect.left;
              startTop = rect.top;

              dock.addClass('dragging').css({
                  left: `${startLeft}px`,
                  top: `${startTop}px`,
                  right: 'auto',
                  bottom: 'auto'
              });

              e.preventDefault();
          });

          $(document).on('pointermove.zmBugDock', function (e) {
              if (!isDragging) {
                  return;
              }

              const width = dock.outerWidth() || 0;
              const height = dock.outerHeight() || 0;
              const maxLeft = Math.max(window.innerWidth - width - 8, 8);
              const maxTop = Math.max(window.innerHeight - height - 8, 8);

              const nextLeft = Math.min(Math.max(startLeft + e.clientX - startX, 8), maxLeft);
              const nextTop = Math.min(Math.max(startTop + e.clientY - startY, 8), maxTop);

              dock.css({
                  left: `${nextLeft}px`,
                  top: `${nextTop}px`
              });
          });

          $(document).on('pointerup.zmBugDock pointercancel.zmBugDock', function () {
              if (!isDragging) {
                  return;
              }
              isDragging = false;
              dock.removeClass('dragging');
          });

          console.log('(zm) 已启用Bug详情页悬浮快捷区');
      }

      // 设置Bug详情页功能
      function setupBugDetailPage() {
          console.info('(zm) 命中Bug详情页初始化', {
            path: location.pathname,
            href: location.href
          });

          $('.label.label-id').on('click', function () {
              GM_setClipboard(`🔨bug(${$(this).text().trim()}): ${$(this).next().text().trim().replace(/【.+】(【.+】)*(-)*/, '')}

禅道BUG链接: [【${$(this).text().trim()}】${$(this).next().text().trim()}](${location.href})`);
          }).attr('title', '点击复制Bug提交信息').css({cursor: 'pointer'});
          enforceEffortLogging();
          console.info('(zm) 已绑定强制工时检查: enforceEffortLogging');
          setupBugQuickActionDock();
      }

      // 设置需求详情页功能
      function setupStoryDetailPage() {
          $('.label.label-id').on('click', function () {
              GM_setClipboard(`🔥feat(${$(this).text().trim()}): ${$(this).next().text().trim().replace(/(【.+?】)(【.+?】)*(-)*(.+)/, '$1$2$4')}

需求链接: [【${$(this).text().trim()}】${$(this).next().text().trim()}](${location.href})`);
          }).attr('title', '点击需求提交信息').css({cursor: 'pointer'});
      }

      // 强制填写工时
      function enforceEffortLogging() {
          $('a').has('.icon-bug-resolve, .icon-bug-assignTo').each((_, e) => {
              e.addEventListener('click', async function (e) {
                  const targetEle = e.target;
                  const { needEffort } = parseBugPage();
                  if (needEffort) {
                      e.stopPropagation();
                      e.preventDefault();
                      $('a.effort').get(0).click();
                  }
              }, true);
          });
      }

      // 设置 "我解决的Bug" 页面功能
      function setupResolvedByMePage() {
          $('<div class="btn btn-success">复制勾选</div>').on('click', function () {
              const bugs = $('tr.checked').map(function () {
                  const tds = $(this).find("td");
                  const id = $(tds[0]).text().trim();
                  const raw = $(tds[4]).text().trim();
                  let range = raw.match(/【([^【】]+?\/.+?)】/);
                  range = !range ? '' : range[1].replace(/(\d\.?|-){3}/, ''); // 移除版本号
                  const title = raw.slice(raw.lastIndexOf('】') + 1);
                  return `${localStorage.getItem('zm-username')}\t\t${id} ${title}\t${range}\n`;
              }).get().join('');
              GM_setClipboard(bugs);
          }).insertBefore('.btn-group.dropdown');
      }

      // 迭代版本页面中，添加一键复制已勾选BUG的按钮
      function addCopyBtnOnVersionBugPage() {
        $('<div class="btn btn-success table-actions btn-toolbar">复制勾选</div>').on('click', function () {
                const bugs = $('tr.checked').map( function () {
                    const tds = $(this).find("td")
                    const id = $(tds[0]).text().trim()
                    const title = $(tds[1]).text().trim()
                    const resolver = $(tds[5]).text().trim()
                    return `${id} ${title}\t${resolver}\n`
            })
            GM_setClipboard(bugs.get().join(''))
        }).insertBefore('.table-statistic')
      }

      /**
       * 配置迭代版本BUG页面
       * 1. 添加一键复制已勾选BUG的按钮
       */
      function setupVersionBugPage() {
        addCopyBtnOnVersionBugPage()
      }



      /**
       * Bug填写工时窗口默认填充1h处理BUG
       */
      function setupBugEffortPage() {
          // 获取Bug ID（不同布局下节点可能不存在）
          const bugIdText = $('#mainContent > div > h2 > span.label.label-id').first().text().trim();
          const bug_id = bugIdText || (location.pathname.match(/effort-createForObject-bug-(\d+)\.html/) || [])[1] || '';
          if (!bug_id) {
            console.warn('(zm) setupBugEffortPage: 未找到 bug_id，跳过默认填充');
            return;
          }

          // Bug类型配置
          const bugTypes = {
              title: 'Bug处理类型',
              color: '#e74c3c',
              items: [
                  {name: '【解决内部BUG】处理BUG ' + bug_id, desc: '自身代码导致的BUG，有禅道BUG跟踪（需关联到禅道问题单）'},
                  {name: '【协助他人处理BUG】BUG归属人<实际归属人/已离职>，处理BUG ' + bug_id, desc: '协助解决或排查其他人的BUG，按照BUG归属人区分。内部测试提出的BUG，需关联到禅道问题单，描述清楚BUG归属人；外部反馈的BUG，需写清楚问题反馈人及BUG归属情况'},
                  {name: '【协助他人】处理外部原因导致的BUG ' + bug_id, desc: '外部人员反馈的BUG，排查后定位为产品质量问题'}
              ]
          };

          // 创建Bug卡片HTML
          const createBugCard = () => {
              const items = bugTypes.items.map(item =>
                  `<li style="margin-bottom: 8px; padding: 8px; background-color: white; border-radius: 4px; cursor: pointer; transition: background-color 0.2s;" 
             title="${item.desc}" data-content="${item.name}">
                ${item.name}
            </li>`
              ).join('');

              return `
        <div style="margin-bottom: 15px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <div style="padding: 10px; background-color: ${bugTypes.color}; color: white; font-weight: bold;">
                ${bugTypes.title}
            </div>
            <ul style="list-style: none; margin: 0; padding: 10px; background-color: #f0f0f0;">
                ${items}
            </ul>
        </div>`;
          };

          // 插入卡片
          insertContentToPage(createBugCard());

          // 添加点击事件
            $("[data-content]").on('click', function () {
              const content = $(this).data('content');
              const contentInput = $(".form-control").eq(2)[0];
              if (contentInput) {
                contentInput.value = content;
              }
              addVisualFeedback($(this), '#ffc7bf');
          });

          // 默认填写工时为1小时
            const effortInput = $(".form-control").eq(1)[0];
            const descInput = $(".form-control").eq(2)[0];
            if (effortInput) effortInput.value = 1;
            if (descInput) descInput.value = "【解决内部BUG】处理BUG " + bug_id;
      }

      /**
       * 任务工时窗口默认填充1h完成任务
       */
      function setupTaskEffortPage() {
          const taskName = $('#mainContent > div > h2 > span:nth-child(2)').first().text().trim();
          if (!taskName) {
            console.warn('(zm) setupTaskEffortPage: 未找到 taskName，跳过默认填充');
            return;
          }

          // 生成任务卡片HTML
          const createTaskCard = (category) => {
              const items = category.items.map(item =>
                  `<li style="margin-bottom: 8px; padding: 8px; background-color: white; border-radius: 4px; cursor: pointer; transition: background-color 0.2s;" 
                 title="${item.desc}" data-task="${item.name}${taskName}">
                <div style="font-weight: bold; color: ${category.color};">${item.name}</div>
             </li>`
              ).join('');

              return `
            <div style="flex: 1; background-color: #f8f9fa; border-radius: 8px;">
                <div style="padding: 10px; background-color: ${category.color}; border-top-left-radius: 8px; border-top-right-radius: 8px; color: white; font-weight: bold;">
                    ${category.title}
                </div>
                <ul style="list-style: none; padding: 0; margin: 0;">${items}</ul>
            </div>`;
          };

          // 生成完整内容
          const content = `
        <div style="border-radius: 10px; background-color: #ccc; padding: 10px; margin-bottom: 10px">
            <p style="color: red; margin-bottom: 15px">* 点击下方文案，可自动填充至第一行</p>
            <div style="display: flex; gap: 15px;">
                ${Object.values(commonTaskTypes).map(createTaskCard).join('')}
            </div>
        </div>
        <style>
            .task-card li:hover {
                background-color: #e9ecef !important;
                transform: translateY(-1px);
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
        </style>`;

          // 插入内容
          insertContentToPage(content);

          // 添加点击事件
          $("div[style*='flex: 1'] li").on('click', function () {
              const fullText = $(this).attr('data-task');
              const targetInput = $(".form-control").eq(3)[0];
              if (targetInput) {
                targetInput.value = fullText;
              }
              addVisualFeedback($(this));
          });
      }

      /**
       * 批量工时创建页面功能增强
       * 点击复制items里的name，处理路径/effort-batchCreate-\d+.html，拼接到id为effortBatchAddHeader的元素后面
       */
      function setupBatchEffortPage() {
          // 使用公共任务类型配置

          // 生成紧凑的任务类型选择器
          const createCompactSelector = () => {
              const categoryHtml = Object.values(commonTaskTypes).map(category => {
                  const itemsHtml = category.items.map(item => 
                      `<span class="zm-task-type-item" 
                           data-task-name="${item.name}" 
                           title="${item.desc}"
                           style="display: inline-block; margin: 2px 4px; padding: 4px 8px; background: white; border: 1px solid ${category.color}; border-radius: 4px; cursor: pointer; font-size: 12px; color: ${category.color}; transition: all 0.2s;">
                          ${item.name}
                      </span>`
                  ).join('');
                  
                  return `
                      <div class="zm-task-category" style="margin-bottom: 8px;">
                          <span class="zm-category-title" style="display: inline-block; margin-right: 8px; padding: 2px 8px; background: ${category.color}; color: white; border-radius: 3px; font-size: 11px; font-weight: bold;">
                              ${category.title}
                          </span>
                          <div class="zm-category-items" style="display: inline-block;">
                              ${itemsHtml}
                          </div>
                      </div>
                  `;
              }).join('');

              return `
                  <div class="zm-task-selector" style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px; font-size: 12px;">
                      <div style="margin-bottom: 8px; color: #666; font-size: 11px;">
                          <i class="icon icon-info-circle"></i> 点击下方任务类型可复制到剪贴板
                      </div>
                      ${categoryHtml}
                  </div>
              `;
          };

          // 生成完整内容
          const content = createCompactSelector();

          // 查找目标容器
          const targetContainer = $('#effortBatchAddHeader');
          if (targetContainer.length > 0) {
              // 插入到目标容器后面
              targetContainer.after(content);
          } else {
              // 如果找不到目标容器，尝试插入到页面开头
              $('#mainContent').prepend(content);
          }

          // 添加点击事件 - 点击复制任务类型名称
          $('.zm-task-type-item').on('click', function () {
              const taskName = $(this).data('task-name');
              if (taskName) {
                  // 复制到剪贴板
                  GM_setClipboard(taskName);
                  
                  // 视觉反馈
                  const $this = $(this);
                  $this.css({
                      'background-color': '#d4edda',
                      'border-color': '#28a745',
                      'color': '#28a745',
                      'transform': 'scale(1.05)'
                  });
                  
                  setTimeout(() => {
                      $this.css({
                          'background-color': 'white',
                          'border-color': $this.css('border-color').replace('#28a745', $this.attr('style').match(/border: 1px solid ([^;]+)/)?.[1] || '#007bff'),
                          'color': $this.attr('style').match(/color: ([^;]+)/)?.[1] || '#007bff',
                          'transform': 'scale(1)'
                      });
                  }, 300);
                  
                  // 显示复制成功提示
                  const originalText = $this.text();
                  $this.text('✅ 已复制').css('color', '#28a745');
                  setTimeout(() => {
                      $this.text(originalText).css('color', $this.attr('style').match(/color: ([^;]+)/)?.[1] || '#007bff');
                  }, 1500);
                  
                  console.log('(zm) 已复制任务类型:', taskName);
              }
          });
          
          // 添加悬停效果
          $('.zm-task-type-item').hover(
              function() {
                  $(this).css({
                      'background-color': '#f8f9fa',
                      'transform': 'translateY(-1px)',
                      'box-shadow': '0 2px 4px rgba(0,0,0,0.1)'
                  });
              },
              function() {
                  $(this).css({
                      'background-color': 'white',
                      'transform': 'translateY(0)',
                      'box-shadow': 'none'
                  });
              }
          );
          
          console.log('(zm) 已设置批量工时创建页面功能');
      }

      // 根据时间范围生成字符串
      function timeRangeStr(start, end = Date.now()) {
          start = new Date(start);
          end = new Date(end);
          const msPerDay = 3.6e6 * 24;
          let ms = 0;

          while (start.getTime() < end) {
              if (workdayCn.isWorkday(start)) {
                  ms += msPerDay;
              }
              start.setDate(start.getDate() + 1);
          }

          ms += end - start;
          ms = Math.max(ms, 0);

          const rawh = ms / 3.6e6;
          const h = Math.trunc(rawh);
          const m = Math.trunc((rawh - h) * 60);
          return { str: `${h} 小时 ${m} 分钟`, h, m };
      }

      // 解析Bug页面
      function parseBugPage(document = window.document) {
          const userName = localStorage.getItem('zm-username');
          const processedRe = new RegExp(`由.${userName}.(指派|解决|确认|添加)`);
          const effortRe = new RegExp(`由.${userName}.记录工时`);
          const assignRe = new RegExp(`由.${userName}.指派`);
          const assignedRe = new RegExp(`指派给.${userName}`);
          const dateRe = /(\d{4}-.+:\d{2})/;

          let start, hasReactive = false, needEffort = true;
          const assignmens = [], reactives = [];

          const current = $('#legendBasicInfo th:contains(当前指派) ~ td').text().trim();

          $(document).find('#actionbox li').each(function () {
              const text = $(this).text().trim();
              if (processedRe.test(text)) {
                  hasReactive = true;
                  reactives.push({ time: new Date(text.match(dateRe)[1]), action: text });
              }
              if (effortRe.test(text)) {
                  needEffort = false;
              }
              if (/由.+创建/.test(text)) {
                  start = new Date(text.match(dateRe)[1]);
              }
              if (assignRe.test(text)) {
                  assignmens.push({ toMe: false, time: new Date(text.match(dateRe)[1]) });
              }
              if (assignedRe.test(text)) {
                  assignmens.push({ toMe: true, time: new Date(text.match(dateRe)[1]) });
                  if (assignmens.length && assignmens[0].toMe) {
                      start = assignmens[0].time;
                  }
                  needEffort = current.includes(userName);
              }
          });

          console.log('(zm)DEBUG: ', { start: new Date(start).toLocaleString(), reactives, assignmens, hasReactive, needEffort });
          return { start, reactives, assignmens, hasReactive, needEffort };
      }

      // 获取Owner信息
      function getOwner(type) {
          const data = {
              "已解决": "研发、产品经理",
              "设计如此": "产品经理",
              "设计缺陷": "项目经理",
              "不予解决": "产品经理",
              "外部原因": "研发",
              "提交错误": "研发",
              "重复Bug": "研发",
              "无法重现": "项目经理",
              "下个版本解决": "产品经理",
              "延期处理": "产品经理"
          };
          return data[type] ? `${type}<span style="color: #8e8e8e;">（填写人：${data[type]}）</span>` : type;
      }

      // 设置Cookie 某些页面需要修改Cookie中的分页和页数才能查询生效
      function setCookie(name, value, options = { path: '/' }) {
        let cookie = `${name}=${encodeURIComponent(value)}`
        
        if (options.path) cookie += `; path=${options.path}`
        if (options.domain) cookie += `; domain=${options.domain}`
        if (options.expires) cookie += `; expires=${options.expires.toUTCString()}`
        if (options.maxAge) cookie += `; max-age=${options.maxAge}`
        if (options.secure) cookie += `; secure`
        if (options.sameSite) cookie += `; samesite=${options.sameSite}`
        
        document.cookie = cookie
      }

      // 生成处理类型选择器
      async function generatorResolveType() {
          const element = await waitForContentInContainer('body', '.modal-trigger.modal-scroll-inside .modal-dialog');
          const oIframe = element.querySelector('iframe');
          oIframe.addEventListener('load', () => {
              const content = oIframe.contentDocument;
              const body = content.querySelector('.m-bug-resolve');
              const oResolveType = body.querySelector('.chosen-container');
              oResolveType.addEventListener('click', () => {
                  const lis = oResolveType.querySelectorAll('li');
                  lis.forEach(node => {
                      const text = getOwner(node.textContent.trim());
                      node.innerHTML = text;
                      node.title = text.replace(/<span style="color: .*;">|<\/span>/g, '');
                  });
              });
          });
      }

      // 等待容器内内容加载
      async function waitForContentInContainer(containerSelector, targetSelector, timeout = 10000) {
          return new Promise((resolve, reject) => {
              let timer;
              const container = document.querySelector(containerSelector);

              if (!container) {
                  return reject(new Error(`Container ${containerSelector} not found`));
              }

              function checkElement() {
                  const element = container.querySelector(targetSelector);
                  if (element) {
                      if (timer) clearTimeout(timer);
                      observer.disconnect();
                      resolve(element);
                  }
              }

              const observer = new MutationObserver(checkElement);
              observer.observe(container, { childList: true, subtree: true });

              const iframes = container.querySelectorAll('iframe');
              let iframeLoadPromises = Array.from(iframes).map(iframe => new Promise(resolve => {
                  iframe.addEventListener('load', resolve);
                  if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
                      resolve();
                  }
              }));

              timer = setTimeout(() => {
                  observer.disconnect();
                  reject(new Error(`Timeout: Element ${targetSelector} not found within ${timeout}ms`));
              }, timeout);

              Promise.all(iframeLoadPromises).then(() => checkElement());
          });
      }

      // 获取网页文档
      async function fetchDocument(url) {
          const response = await fetch(url);
          const arrayBuffer = await response.arrayBuffer();
          const decoder = new TextDecoder(document.characterSet);
          return new DOMParser().parseFromString(decoder.decode(arrayBuffer), 'text/html');
      }

      // 修改面板创建代码
      async function createFloatBall() {
          // 检查是否在登录页面
          if (/user-login|file-read/.test(window.location.pathname)) {
              return;
          }

          // 检查是否在iframe中
          if (window.self !== window.top) {
              return;
          }

          // 检查是否已存在悬浮球
          if ($('.zm-float-ball').length > 0) {
              return;
          }

          // 添加拖动相关样式
          GM_addStyle(`
              .zm-float-ball {
                  user-select: none;
                  touch-action: none;
                  transition: all 0.3s;
                  z-index: 9999;
              }
              .zm-float-ball.dragging {
                  transition: none;
                  opacity: 0.8;
              }
              .zm-panel {
                  z-index: 9998;
              }
          `);

          const floatBall = $(`
              <div class="zm-float-ball">
                  <i class="icon icon-zentao"></i>
              </div>
          `).appendTo('body');

          // 创建带标签页的面板
          const panel = $(`
            <div class="zm-panel">
              <div class="zm-panel-header">
                <div class="zm-panel-tabs">
                  <span class="zm-panel-tab active" data-strategy="workHours">
                    <i class="icon icon-time"></i>工时提醒
                  </span>
                  <span class="zm-panel-tab" data-strategy="myBugs">
                    <i class="icon icon-bug"></i>Bug统计
                  </span>
                </div>
                <i class="icon icon-refresh" style="float: right; cursor: pointer; font-size: 14px;"></i>
              </div>
              <div class="zm-panel-content"></div>
            </div>
          `).appendTo('body');

          // 从 localStorage 获取上次选中的面板
          let currentStrategy = localStorage.getItem('zm-panel-active') || 'workHours';
          
          // 初始化激活状态
          panel.find('.zm-panel-tab').removeClass('active');
          panel.find(`[data-strategy="${currentStrategy}"]`).addClass('active');

          // 标签切换逻辑
          panel.find('.zm-panel-tab').click(async function() {
            const strategyName = $(this).data('strategy');
            // 避免重复加载相同策略
            if (strategyName === panelStrategies.currentStrategy) return;

            panel.find('.zm-panel-tab').removeClass('active');
            $(this).addClass('active');
            
            // 保存当前选中的面板到 localStorage
            localStorage.setItem('zm-panel-active', strategyName);
            currentStrategy = strategyName; // 更新当前策略

            // 使用新的切换方法
            await panelStrategies.switchStrategy(strategyName, panel.find('.zm-panel-content'));
            if (panel.is(':visible')) {
                updatePanelPosition();
            }
          });

          // 初始加载内容
          await panelStrategies.switchStrategy(currentStrategy, panel.find('.zm-panel-content'));

          // 修改刷新按钮事件处理
          panel.find('.icon-refresh').click(
            debounce(async function(e) {
              e.stopPropagation();
              
              // 刷新时取消所有进行中的请求
              requestManager.clear();
              
              const refreshIcon = $(this);
              refreshIcon.css({
                'transform': 'rotate(360deg)',
                'transition': 'transform 0.5s'
              });
              
              const strategy = panelStrategies.get(currentStrategy);
              await strategy.render(panel.find('.zm-panel-content'));
              if (panel.is(':visible')) {
                  updatePanelPosition();
              }
              
              setTimeout(() => {
                refreshIcon.css({
                  'transform': 'rotate(0deg)',
                  'transition': 'none'
                });
              }, 500)
            }, 300) // 300ms 的防抖延迟
          );

          // 修改拖动相关变量
          let isDragging = false;
          let startX, startY;
          let initialLeft, initialTop;
          const margin = 20;
          const dragThreshold = 5;
          let hasDragged = false;

          // 更新位置的动画函数
          function updatePosition(mouseX, mouseY) {
              if (!isDragging) return;

              // 计算位移
              const deltaX = mouseX - startX;
              const deltaY = mouseY - startY;
              
              // 计算新位置
              let left = initialLeft + deltaX;
              let top = initialTop + deltaY;
              
              // 边界限制
              const maxX = window.innerWidth - floatBall.outerWidth();
              const maxY = window.innerHeight - floatBall.outerHeight();
              
              left = Math.max(0, Math.min(left, maxX));
              top = Math.max(0, Math.min(top, maxY));
              
              floatBall.css({
                  left: left + 'px',
                  top: top + 'px',
                  right: 'auto'
              });

              // 实时更新面板位置
              if (panel.is(':visible')) {
                  updatePanelPosition();
              }
          }

          // 修改 pointer events 处理
          floatBall[0].addEventListener('pointerdown', function(e) {
              isDragging = true;
              hasDragged = false;
              floatBall.addClass('dragging');
              
              // 立即隐藏面板，不使用动画
              if (panel.is(':visible')) {
                  panel.hide();
                  $('.zm-panel-content').empty();
              }
              
              this.setPointerCapture(e.pointerId);
              
              // 记录初始位置
              startX = e.clientX;
              startY = e.clientY;
              const rect = floatBall[0].getBoundingClientRect();
              initialLeft = rect.left;
              initialTop = rect.top;
              
              e.preventDefault();
          });

          document.addEventListener('pointermove', function(e) {
              if (!isDragging) return;
              if (Math.abs(e.clientX - startX) > dragThreshold || Math.abs(e.clientY - startY) > dragThreshold) {
                  hasDragged = true;
              }
              updatePosition(e.clientX, e.clientY);
              e.preventDefault();
          });

          document.addEventListener('pointerup', function(e) {
              if (!isDragging) return;
              isDragging = false;
              floatBall.removeClass('dragging');
              try {
                  floatBall[0].releasePointerCapture(e.pointerId);
              } catch (err) {
                  // Ignore PointerCapture errors in some browsers.
              }
          });

          // 防止文本选择和其他默认行为
          $(document).on('selectstart dragstart', function(e) {
              if (isDragging) {
                  e.preventDefault();
                  return false;
              }
          });

          // 添加一个变量来追踪面板状态
          let isPanelVisible = false;

          // 修改点击悬浮球显示面板的代码
          floatBall.click(async function(e) {
              if (hasDragged) return;
              
              e.stopPropagation();
              
              if (!isPanelVisible) {
                  // 显示面板时取消所有进行中的请求
                  requestManager.clear();
                  
                  panel.css('opacity', 0).show();
                  updatePanelPosition();
                  panel.animate({ opacity: 1 }, 200);
                  isPanelVisible = true;
                  
                  const strategy = panelStrategies.get(currentStrategy);
                  await strategy.render(panel.find('.zm-panel-content'));
                  updatePanelPosition();
              } else {
                  panel.fadeOut(200, function() {
                      $('.zm-panel-content').empty();
                      isPanelVisible = false;
                  });
              }
          });

          // 更新面板位置函数优化
          function updatePanelPosition() {
              const ballRect = floatBall[0].getBoundingClientRect();
              const panelWidth = panel.outerWidth();
              const panelHeight = panel.outerHeight();
              const windowWidth = window.innerWidth;
              const windowHeight = window.innerHeight;
              const gap = 10;
              
              // 计算各个方向的可用空间
              const leftSpace = ballRect.left;
              const rightSpace = windowWidth - ballRect.right;
              const topSpace = ballRect.top;
              const bottomSpace = windowHeight - ballRect.bottom;
              
              // 水平位置计算
              let left;
              const preferRight = rightSpace >= leftSpace;
              if (rightSpace >= panelWidth + gap || (preferRight && rightSpace > 0)) {
                  left = ballRect.right + gap;
              } else if (leftSpace >= panelWidth + gap) {
                  left = ballRect.left - panelWidth - gap;
              } else {
                  left = preferRight ? (windowWidth - panelWidth - gap) : gap;
              }
              left = Math.max(gap, Math.min(left, windowWidth - panelWidth - gap));

              
              
              // 垂直位置计算
              let top;
              const preferBottom = bottomSpace >= topSpace;
              if (bottomSpace >= panelHeight + gap || (preferBottom && bottomSpace > 0)) {
                  top = ballRect.bottom + gap;
              } else if (topSpace >= panelHeight + gap) {
                  top = ballRect.top - panelHeight - gap;
              } else {
                  top = preferBottom ? (windowHeight - panelHeight - gap) : gap;
              }
              top = Math.max(gap, Math.min(top, windowHeight - panelHeight - gap));

              
              
              panel.css({
                  left: left + 'px',
                  top: top + 'px',
                  transform: 'none'
              });
          }

          // 监听悬浮球位置变化
          const observer = new MutationObserver(() => {
              if (panel.is(':visible')) {
                  updatePanelPosition();
              }
          });
          
          observer.observe(floatBall[0], {
              attributes: true,
              attributeFilter: ['style']
          });

          // Update position when panel size changes after content loads.
          if (window.ResizeObserver) {
              const panelSizeObserver = new ResizeObserver(() => {
                  if (panel.is(':visible')) {
                      updatePanelPosition();
                  }
              });
              panelSizeObserver.observe(panel[0]);
          } else {
              const panelContentObserver = new MutationObserver(() => {
                  if (panel.is(':visible')) {
                      updatePanelPosition();
                  }
              });
              panelContentObserver.observe(panel.find('.zm-panel-content')[0], {
                  childList: true,
                  subtree: true,
                  characterData: true
              });
          }

          // 点击其他区域隐藏面板时也需要更新状态
          $(document).click(function(e) {
              if (!$(e.target).closest('.zm-panel').length) {
                  panel.fadeOut(200, function() {
                      $('.zm-panel-content').empty();
                      isPanelVisible = false;
                  });
              }
          });
      }

      // 数据获取策略
      const dataStrategies = {
        strategies: {},
        
        register(name, strategy) {
          if (!strategy.fetch) {
            console.error('Data strategy must have fetch function');
            return;
          }
          this.strategies[name] = strategy;
        },

        async fetch(name, ...args) {
          const strategy = this.strategies[name];
          if (!strategy) {
            console.error(`Data strategy ${name} not found`);
            return null;
          }
          return await strategy.fetch(...args);
        }
      };

      // 修改数据获取策略
      dataStrategies.register('workHours', {
        async fetch() {
          try {
            const controller = new AbortController();
            requestManager.register('workHours', controller);
            
            setCookie('pagerMyEffort', 100);
            
            const response = await fetch('/my-effort-all-date_desc-1000000-100-1.json', {
              signal: controller.signal
            });
            const text = await response.text(); // 先获取文本响应
            
            // 尝试解析 JSON
            let rawData;
            try {
              rawData = JSON.parse(text);
            } catch (e) {
              throw new Error('Invalid JSON response');
            }
            
            // 确保数据格式正确
            if (!rawData.data) {
              throw new Error('Invalid data format');
            }
            
            const data = JSON.parse(rawData.data);
            const efforts = data.efforts;
            
            // 获取日期范围
            const startDate = new Date(efforts[efforts.length - 1].date);
            const endDate = new Date(efforts[0].date);
            
            // 获取周期内的工作日
            const workdays = workdayCn.getWorkdaysBetween(startDate, endDate);
            
            // 计算每天的工时
            const dailyHours = new Map();
            efforts.forEach(effort => {
                const date = effort.date;
                const hours = parseFloat(effort.consumed);
                const currentHours = dailyHours.get(date) || 0;
                // 使用 toFixed(2) 确保精度，避免浮点数运算误差
                dailyHours.set(date, parseFloat((currentHours + hours).toFixed(2)));
            });
            
            // 获取用户已删除的日期列表和请假日期列表
            const removedDates = JSON.parse(localStorage.getItem('zm-removed-work-hours-dates') || '[]');
            const leaveDates = JSON.parse(localStorage.getItem('zm-leave-dates') || '[]');
            
            // 找出工时不足的日期并按时间逆序排序（排除用户已删除的日期和请假日期）
            return workdays
              .map(date => date.toISOString().split('T')[0])
              .filter(date => {
                  const hours = dailyHours.get(date) || 0;
                  return hours < 8 && !removedDates.includes(date) && !leaveDates.includes(date);
              })
              .map(date => {
                const hours = dailyHours.get(date);
                return {
                  date,
                  hours: hours ? Number(hours.toFixed(2)) : 0
                }
              })
              .sort((a, b) => new Date(b.date) - new Date(a.date));
          } catch (err) {
            if (err.name === 'AbortError') {
              console.log('Work hours request aborted');
              return [];
            }
            console.error('Error fetching work hours:', err);
            throw err;
          } finally {
            requestManager.requests.delete('workHours');
          }
        }
      });

      // 添加本周工时检测策略
      dataStrategies.register('weeklyWorkHours', {
        async fetch() {
          try {
            const controller = new AbortController();
            requestManager.register('weeklyWorkHours', controller);
            
            setCookie('pagerMyEffort', 1000);
            
            const response = await fetch('/my-effort-all-date_desc-1000000-1000-1.json', {
              signal: controller.signal
            });
            const text = await response.text();
            
            let rawData;
            try {
              rawData = JSON.parse(text);
            } catch (e) {
              throw new Error('Invalid JSON response');
            }
            
            if (!rawData.data) {
              throw new Error('Invalid data format');
            }
            
            const data = JSON.parse(rawData.data);
            const efforts = data.efforts;
            
            // 计算近7天工作日（包含当天）
            const today = new Date();
            const currentDay = today.getDay(); // 0=周日, 1=周一, ..., 6=周六
            
            // 获取近7天的工作日
            const workdays = [];
            let workdayCount = 0;
            
            // 从今天开始往前查找，直到找到7个工作日
            for (let i = 1; workdayCount < 7; i++) {
              const currentDate = new Date(today);
              currentDate.setDate(today.getDate() - i);
              
              if (workdayCn.isWorkday(currentDate)) {
                workdays.unshift(currentDate); // 添加到数组开头，保持时间顺序
                workdayCount++;
              }
            }
            
            // 获取开始和结束日期
            const startDate = workdays[0];
            const endDate = workdays[workdays.length - 1];
            
            // 调试信息
            console.log('(zm) 近7天工作日计算调试:', {
              today: today.toISOString().split('T')[0],
              currentDay: currentDay,
              startDate: startDate.toISOString().split('T')[0],
              endDate: endDate.toISOString().split('T')[0],
              workdays: workdays.map(d => d.toISOString().split('T')[0])
            });
            
            // 使用计算出的工作日范围
            const weekWorkdays = workdays;
            
            // 计算每天的工时
            const dailyHours = new Map();
            efforts.forEach(effort => {
                const date = effort.date;
                const hours = parseFloat(effort.consumed);
                const currentHours = dailyHours.get(date) || 0;
                // 使用 toFixed(2) 确保精度，避免浮点数运算误差
                dailyHours.set(date, parseFloat((currentHours + hours).toFixed(2)));
            });
            
            // 获取用户已删除的日期列表和请假日期列表
            const removedDates = JSON.parse(localStorage.getItem('zm-removed-work-hours-dates') || '[]');
            const leaveDates = JSON.parse(localStorage.getItem('zm-leave-dates') || '[]');
            
            // 检查本周是否有工时不足的日期（排除用户已删除的日期和请假日期）
            const insufficientDays = weekWorkdays
              .map(date => date.toISOString().split('T')[0])
              .filter(date => {
                  const hours = dailyHours.get(date) || 0;
                  return hours < 8 && !removedDates.includes(date) && !leaveDates.includes(date);
              });
            
            return {
              hasInsufficientHours: insufficientDays.length > 0,
              insufficientDays: insufficientDays.map(date => ({
                date,
                hours: dailyHours.get(date) || 0
              })),
              weekRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
              }
            };
          } catch (err) {
            if (err.name === 'AbortError') {
              console.log('Weekly work hours request aborted');
              return { hasInsufficientHours: false, insufficientDays: [], weekRange: null };
            }
            console.error('Error fetching weekly work hours:', err);
            throw err;
          } finally {
            requestManager.requests.delete('weeklyWorkHours');
          }
        }
      });

      // 修改Bug数据获取策略
      dataStrategies.register('bugs', {
        async fetch() {
          try {
            const controller = new AbortController();
            requestManager.register('bugs', controller);
            
            const userName = localStorage.getItem('zm-username');
            if (!userName) return [];

            const response = await fetch('/my-work-bug.html', {
              signal: controller.signal
            });
            const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            const bugs = Array.from(doc.querySelectorAll('tr')).slice(1);
            
            const bugDetails = (await Promise.all(
              bugs.map(async tr => {
                const id = tr.cells[0].textContent.trim();
                const title = tr.cells[4].textContent.trim();
                const status = tr.cells[6].textContent.trim();
                
                const detailResponse = await fetch(`/bug-view-${id}.json`, {
                  signal: controller.signal
                });
                const rawDetail = await detailResponse.json();
                const detail = JSON.parse(rawDetail.data);
                
                const users = detail.users || {};
                const { assignedDate, resolvedBy, assignedTo } = detail.bug;
                const actions = Object.values(detail.actions).sort((a, b) => 
                  new Date(a.date) - new Date(b.date)
                );
                // 确定开始时间
                let startDate = null;
                if (actions.length === 1) {
                  // 只有一条记录，且初始指派给自己
                  if (users[assignedTo] === userName) {
                    startDate = assignedDate;
                  }
                } else {
                  // 检查历史记录中是否存在从自己转出的情况
                  const hasAssignFromMe = actions.some(action => {
                    if (!action.history) return false;
                    return action.history.some(h => 
                      h.field === 'assignedTo' && 
                      users[h.old] === userName
                    );
                  });

                  if (hasAssignFromMe) {
                    // 历史记录中存在从自己转出的情况
                    // 使用第一条记录的时间
                    startDate = actions[0].date;
                  } else {
                    // 查找指派给自己的操作
                    const assignToMeAction = actions.find(a => users[a.extra] === userName);
                    if (assignToMeAction) {
                      startDate = assignToMeAction.date;
                    } else if (users[assignedTo] === userName) {
                      // 最后才考虑初始指派
                      startDate = actions[0].date;
                    }
                  }
                }
                // 如果没有找到开始时间，说明bug不属于当前用户
                if (!startDate) {
                  return null;
                }
                
                
                const start = new Date(startDate);
                const {str: timeStr, h: hours} = timeRangeStr(start);
                
                // 检查是否有自己的操作记录
                const hasMyAction = actions.some(action => 
                  users[action.actor] === userName
                );

                return {
                  id,
                  title,
                  status,
                  timeStr,
                  hours,
                  resolvedBy: users[resolvedBy] || resolvedBy,
                  confirmed: detail.bug.confirmed === '1',
                  hasMyAction,
                  assignedTo: users[assignedTo]
                };
              })
            )).filter(Boolean);

            // 对bugs进行分类
            return {
              new24h: bugDetails.filter(bug => 
                bug.hours <= 24  // 24小时内新增
              ).sort((a, b) => b.hours - a.hours),  // 按时长降序
              unconfirmed: bugDetails.filter(bug => 
                bug.assignedTo === userName && !bug.confirmed
              ).sort((a, b) => b.hours - a.hours),
              untreated36h: bugDetails.filter(bug => 
                bug.hours >= 36 && bug.hours < 72 && (!bug.confirmed || !bug.hasMyAction)
              ).sort((a, b) => b.hours - a.hours),
              unresolved72h: bugDetails.filter(bug => 
                bug.hours >= 72 && !bug.resolvedBy
              ).sort((a, b) => b.hours - a.hours),
              pendingResolve: bugDetails.filter(bug => 
                bug.confirmed && bug.hours > 24 && bug.hours < 72
              ).sort((a, b) => b.hours - a.hours)
            };
            
          } catch (err) {
            if (err.name === 'AbortError') {
              console.log('Bugs request aborted');
            }
            console.error('Error fetching bug details:', err);
            throw err;
          } finally {
            requestManager.requests.delete('bugs');
          }
        }
      });

       // 虚拟滚动组件
       class VirtualScroll {
         constructor(options) {
           const defaultOptions = {
             itemHeight: 32,
             visibleCount: 10,
             bufferSize: 5,
             container: null,
             data: [],
             renderItem: null,
             className: '',
             maxHeight: 360 // 添加最大高度限制
           };
           
           this.options = { ...defaultOptions, ...options };
           this.init();
         }

         init() {
           const { itemHeight, visibleCount, data, container, className, maxHeight } = this.options;
           
           // 计算实际需要的高度，不超过maxHeight
           const totalHeight = data.length * itemHeight;
           const actualHeight = Math.min(totalHeight, maxHeight);
           
           this.$container = $(`
             <div class="zm-virtual-list ${className}" style="height: ${actualHeight}px; overflow-y: auto;">
               <div class="zm-virtual-content" style="position: relative;"></div>
             </div>
           `);
           
           this.$virtualContent = this.$container.find('.zm-virtual-content');
           this.$virtualContent.css('height', `${totalHeight}px`);
           
           $(container).append(this.$container);
           
           this.$container.on('scroll', debounce(() => {
             requestAnimationFrame(() => {
               this.render();
             });
           }, 16));
           
           this.render();
         }

         render() {
           const { itemHeight, bufferSize, data, renderItem } = this.options;
           const scrollTop = this.$container.scrollTop();
           
           const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
           const endIndex = Math.min(
             data.length,
             Math.ceil((scrollTop + this.$container.height()) / itemHeight) + bufferSize
           );
           
           this.$virtualContent.empty();
           
           for (let i = startIndex; i < endIndex; i++) {
             const itemContent = renderItem(data[i], i);
             const $item = $('<div>', {
               class: 'zm-panel-item',
               css: {
                 position: 'absolute',
                 top: `${i * itemHeight}px`,
                 width: '100%',
                 height: `${itemHeight}px`
               }
             }).html(itemContent);
             
             this.$virtualContent.append($item);
           }
         }

         updateData(newData) {
           this.options.data = newData;
           this.$virtualContent.css('height', `${newData.length * this.options.itemHeight}px`);
           this.render();
         }

         destroy() {
           this.$container.remove();
         }
       }

       // 工时提醒面板
       const workHoursPanel = {
         strategy: {
           title: '工时提醒',
           icon: 'icon-time',
           async render(content) {
             try {
               content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
               
               const insufficientDays = await dataStrategies.fetch('workHours');
               
               content.empty();
               if (!insufficientDays || insufficientDays.length === 0) {
                 content.append('<div class="zm-panel-item">所有工作日工时已填写完整 👍</div>');
                 return;
               }

               new VirtualScroll({
                 container: content,
                 data: insufficientDays,
                 className: 'work-hours',
                 itemHeight: 48,
                 maxHeight: 360, // 限制最大高度
                 renderItem: (day) => 
                   $('<div>').append(
                     $('<span>').text(day.date),
                     $('<span>').addClass('zm-hours').text(`${day.hours}h / 8h`)
                   ).html()
               });
               
             } catch (err) {
               if (err.name === 'AbortError') {
                 content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
                 return;
               }
               content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
             }
           }
         },
         
         style: `
           .zm-virtual-list.work-hours .zm-panel-item {
             line-height: 40px;
             padding: 4px 16px;
             display: flex;
             justify-content: space-between;
             align-items: center;
             border-bottom: 1px solid #f0f0f0;
             background-color: #fff;
           }
           
           .zm-virtual-list.work-hours .zm-hours {
             color: #ff4d4f;
             font-size: 12px;
           }
         `
       };

       // Bug统计面板
       const bugsPanel = {
         strategy: {
           title: 'Bug统计',
           icon: 'icon-bug',
           async render(content) {
             try {
               content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
               
               const bugs = await dataStrategies.fetch('bugs');
               
               content.empty();
               if (!bugs || !Object.values(bugs).some(arr => arr.length > 0)) {
                 content.append('<div class="zm-panel-item">暂无Bug</div>');
                 return;
               }

               // 添加提示信息(如果是首次查看)
               if (!localStorage.getItem('zm-bug-tip-shown')) {
                 content.append(`
                   <div class="zm-bug-tip">
                     <span>💡 点击Bug ID可直接跳转到详情页</span>
                     <span class="close-tip">×</span>
                   </div>
                 `);
                 
                 content.find('.close-tip').click(function() {
                   $(this).parent().fadeOut(200);
                   localStorage.setItem('zm-bug-tip-shown', 'true');
                 });
               }

               // 更新分类配置和显示顺序
               const categories = [
                 { key: 'untreated36h', title: '36小时未处理', color: '#ff4d4f' },
                 { key: 'unresolved72h', title: '72小时未解决', color: '#f5222d' },
                 { key: 'pendingResolve', title: '待解决Bug', color: '#1890ff' },
                 { key: 'new24h', title: '24小时内新增', color: '#52c41a' }
               ];

               // 添加展开全部按钮
               content.append(`
                 <div class="zm-bug-expand-all">
                   <span class="expand-all-btn">展开全部</span>
                 </div>
               `);

               categories.forEach(({key, title, color}) => {
                 if (bugs[key].length > 0) {
                   const isExpanded = key === 'pendingResolve'; // 默认展开待解决bug
                   content.append(`
                     <div class="zm-bug-category">
                       <div class="zm-bug-category-title ${isExpanded ? 'expanded' : ''}" style="color: ${color}">
                         <i class="icon icon-chevron-right ${isExpanded ? 'icon-rotate-90' : ''}"></i>
                         ${title} (${bugs[key].length})
                       </div>
                       <div class="zm-bug-list-${key}" style="display: ${isExpanded ? 'block' : 'none'}"></div>
                     </div>
                   `);

                   new VirtualScroll({
                     container: content.find(`.zm-bug-list-${key}`),
                     data: bugs[key],
                     className: 'bugs',
                     itemHeight: 32,
                     visibleCount: Math.min(bugs[key].length, 5),
                     maxHeight: 200, // 限制每个分类的最大高度
                     renderItem: (bug) => {
                       // 根据时长确定颜色类
                       let colorClass = '';
                       if (bug.hours <= 24) {
                         colorClass = 'green';
                       } else if (bug.hours <= 34) {
                         colorClass = 'orange';
                       } else if (bug.hours <= 70) {
                         colorClass = 'yellow';
                       } else {
                         colorClass = 'red';
                       }
                       
                       return $('<div>')
                         .addClass('zm-bug-item')
                         .css('cursor', 'pointer')
                         .on('click', () => {
                           window.open(`/bug-view-${bug.id}.html`, '_blank');
                         })
                         .append(
                           $('<a>')
                             .addClass('zm-bug-id')
                             .attr('href', `/bug-view-${bug.id}.html`)
                             .attr('target', '_blank')
                             .text(`Bug: ${bug.id}`)
                             .attr('title', bug.title),
                           $('<span>')
                             .addClass(`zm-bug-hours ${colorClass}`)
                             .text(bug.timeStr)
                         ).html();
                     }
                   });
                 }
               });
               
               // 添加折叠/展开事件处理
               content.find('.zm-bug-category-title').click(function() {
                 $(this).toggleClass('expanded');
                 $(this).find('.icon').toggleClass('icon-rotate-90');
                 $(this).next('.zm-bug-list-' + $(this).parent().find('[class^="zm-bug-list-"]').attr('class').split('-')[3]).slideToggle(200);
                 
                 // 检查是否所有分类都已展开
                 const allExpanded = content.find('.zm-bug-category-title.expanded').length === content.find('.zm-bug-category-title').length;
                 content.find('.expand-all-btn').text(allExpanded ? '折叠全部' : '展开全部');
               });

               // 展开全部按钮事件处理
               content.find('.expand-all-btn').click(function() {
                 const isExpandAll = $(this).text() === '展开全部';
                 $(this).text(isExpandAll ? '折叠全部' : '展开全部');
                 content.find('.zm-bug-category-title').each(function() {
                   const $title = $(this);
                   const $list = $title.next('[class^="zm-bug-list-"]');
                   if (isExpandAll) {
                     $title.addClass('expanded');
                     $title.find('.icon').addClass('icon-rotate-90');
                     $list.slideDown(200);
                   } else {
                     $title.removeClass('expanded');
                     $title.find('.icon').removeClass('icon-rotate-90');
                     $list.slideUp(200);
                   }
                 });
               });
               
             } catch (err) {
               if (err.name === 'AbortError') {
                 content.html('<div class="zm-panel-item" style="text-align: center;">加载中...</div>');
                 return;
               }
               content.html(`<div class="zm-panel-item error">加载失败: ${err.message}</div>`);
             }
           }
         },
         
         style: `
           .zm-virtual-list.bugs .zm-panel-item {
             padding: 8px 12px;
           }
           
           .zm-bug-category {
             margin-bottom: 12px;
           }

           .zm-bug-category-title {
             padding: 8px 12px;
             font-weight: bold;
             background: #fafafa;
             cursor: pointer;
             user-select: none;
             display: flex;
             align-items: center;
           }
           
           .zm-bug-category-title:hover {
             background: #f0f0f0;
           }
           
           .zm-bug-category-title .icon {
             margin-right: 8px;
             transition: transform 0.2s;
           }
           
           .zm-bug-category-title .icon-rotate-90 {
             transform: rotate(90deg);
           }
           
           .zm-bug-item {
             display: flex;
             align-items: center;
             width: 100%;
             transition: background-color 0.2s;
           }
           
           .zm-bug-item:hover {
             background-color: rgba(24, 144, 255, 0.1);
           }
           
           .zm-bug-id {
             color: #666;
             margin-right: 8px;
             cursor: pointer;
             text-decoration: none;
             position: relative;
           }
           
           .zm-bug-id:hover {
             color: #1890ff;
             text-decoration: underline;
           }
           
           /* 添加鼠标悬停提示图标 */
           .zm-bug-id::before {
             content: '🔗';
             font-size: 12px;
             margin-right: 4px;
             opacity: 0;
             transition: opacity 0.2s;
           }
           
           .zm-bug-id:hover::before {
             opacity: 1;
           }
           
           /* 首次打开面板时的提示样式 */
           .zm-bug-tip {
             padding: 8px 12px;
             background: #e6f7ff;
             border: 1px solid #91d5ff;
             border-radius: 4px;
             margin-bottom: 8px;
             font-size: 12px;
             color: #1890ff;
             display: flex;
             align-items: center;
             justify-content: space-between;
           }
           
           .zm-bug-tip .close-tip {
             cursor: pointer;
             color: #1890ff;
             font-size: 14px;
           }
           
           .zm-bug-title {
             flex: 1;
             overflow: hidden;
             text-overflow: ellipsis;
             white-space: nowrap;
           }
           
           .zm-bug-hours {
             font-size: 12px;
             margin-left: 8px;
           }
           
           .zm-bug-hours.green { color: #52c41a; }
           .zm-bug-hours.yellow { color: #faad14; }
           .zm-bug-hours.orange { color: #fa8c16; }
           .zm-bug-hours.red { color: #ff4d4f; }
           
           .zm-bug-expand-all {
             padding: 8px 12px;
             border-bottom: 1px solid #f0f0f0;
           }

           .expand-all-btn {
             color: #1890ff;
             cursor: pointer;
             user-select: none;
           }

           .expand-all-btn:hover {
             color: #40a9ff;
           }
         `
       };

       // 注册面板
       panelStrategies.register('workHours', workHoursPanel.strategy);
       panelStrategies.register('myBugs', bugsPanel.strategy);

       // 添加样式
       GM_addStyle(`
         /* 通用虚拟列表样式 */
         .zm-panel-content {
           width: 100%;
         }

         .zm-virtual-list {
           position: relative;
           border-top: 1px solid #f0f0f0;
           width: 100%;
         }
         
         .zm-virtual-list .zm-virtual-content {
           width: 100%;
         }
         
         .zm-virtual-list .zm-panel-item {
           box-sizing: border-box;
           width: 100%;
         }
         
         .zm-virtual-list .zm-panel-item:hover {
           background-color: #f5f5f5;
         }
         
         /* 各面板特定样式 */
         ${workHoursPanel.style}
         ${bugsPanel.style}
       `);
  });
})();

// 添加面板样式
GM_addStyle(`
  .zm-panel {
    position: fixed;
    width: 300px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    display: none;
    z-index: 9999;
  }

  .zm-panel-header {
    padding: 12px;
    border-bottom: 1px solid #f0f0f0;
  }

  .zm-panel-tabs {
    display: flex;
    gap: 12px;
  }

  .zm-panel-tab {
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.3s;
    user-select: none;
  }

  .zm-panel-tab:hover {
    background: rgba(0,0,0,0.05);
  }

  .zm-panel-tab.active {
    background: #1890ff;
    color: white;
  }

  .zm-panel-tab i {
    margin-right: 4px;
  }

  .zm-panel-content {
    padding: 12px;
    max-height: 400px;
    overflow-y: auto;
  }

  .zm-panel-item {
    padding: 8px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #f0f0f0;
  }

  .zm-panel-item:last-child {
    border-bottom: none;
  }
`);

// 简单的debounce实现
function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}


