import { icon } from './icons.js';

/** Side view of the building: one shaft per lift, cars glide between floors. */
export class BuildingView {
  constructor(root, { rowHeight = 30, showMeta = true } = {}) {
    this.root = root;
    this.rowHeight = rowHeight;
    this.showMeta = showMeta;
    this.key = null;
    this.cars = [];
  }

  render(state) {
    const key = `${state.levels}:${state.lifts.length}:${this.rowHeight}`;
    if (key !== this.key) {
      this.build(state);
      this.key = key;
    }
    this.update(state);
  }

  build(state) {
    const { levels, lifts } = state;
    const height = levels * this.rowHeight;
    this.root.className = 'building';
    this.root.innerHTML = `
      <div class="floor-labels" style="height:${height}px">
        ${Array.from({ length: levels }, (_, i) => levels - 1 - i)
          .map((f) => `<span style="top:${(levels - 1 - f) * this.rowHeight}px;height:${this.rowHeight}px">${state.floorLabels[f]}</span>`)
          .join('')}
      </div>
      ${lifts
        .map(
          (lift) => `
        <div class="shaft-col">
          ${
            this.showMeta
              ? `<div class="shaft-head">
                   <div class="name">${icon('lift')} ${lift.name}</div>
                   <div class="meta" data-meta="${lift.id}">Floor ${state.floorLabels[lift.floor]}</div>
                 </div>`
              : ''
          }
          <div class="shaft" style="--row-h:${this.rowHeight}px;height:${height}px">
            <div class="car" data-car="${lift.id}"><span class="doors"></span><span class="num"></span><span class="load"><i></i></span></div>
          </div>
        </div>`,
        )
        .join('')}
    `;
    this.cars = lifts.map((lift) => ({
      id: lift.id,
      el: this.root.querySelector(`[data-car="${lift.id}"]`),
      num: this.root.querySelector(`[data-car="${lift.id}"] .num`),
      load: this.root.querySelector(`[data-car="${lift.id}"] .load i`),
      meta: this.root.querySelector(`[data-meta="${lift.id}"]`),
    }));
  }

  update(state) {
    const { levels, floorLabels } = state;
    for (const car of this.cars) {
      const lift = state.lifts.find((l) => l.id === car.id);
      if (!lift) continue;
      const top = (levels - 1 - lift.pos) * this.rowHeight + 3;
      car.el.style.top = `${top}px`;
      car.el.className = `car ${lift.halted ? 'halted' : lift.direction > 0 ? '' : lift.direction < 0 ? 'down' : 'idle'} ${
        lift.state === 'doors_open' || lift.state === 'doors_close' ? 'opening' : ''
      }`;
      car.num.textContent = floorLabels[lift.floor];
      car.load.style.width = `${Math.round((lift.load / Math.max(1, lift.capacity)) * 100)}%`;
      if (car.meta) {
        car.meta.textContent = `${floorLabels[lift.floor]} · ${lift.status}${lift.load ? ` · ${lift.load} aboard` : ''}`;
      }
    }
  }
}
