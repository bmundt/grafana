///<reference path="../../../headers/common.d.ts" />

import _ from 'lodash';
import moment from 'moment';
import kbn from 'app/core/utils/kbn';

export class TableRenderer {
  formaters: any[];
  colorState: any;

  constructor(private panel, private table, private isUtc, private sanitize) {
    this.formaters = [];
    this.colorState = {};
  }

  getColorForValue(value, style) {
    if (!style.thresholds) { return null; }

    for (var i = style.thresholds.length; i > 0; i--) {
      if (_.isNumber(value) && value >= style.thresholds[i - 1]) {
        return style.colors[i];
      } else if (_.isString(value) && value.match(style.thresholds[i-1])) {
        return style.colors[i];
      }
    }
    return _.first(style.colors);
  }

  defaultCellFormater(v, style) {
    if (v === null || v === void 0 || v === undefined) {
      return '';
    }

    if (_.isArray(v)) {
      v = v.join(', ');
    }

    if (style && style.sanitize) {
      return this.sanitize(v);
    } else {
      return _.escape(v);
    }
  }

  createColumnFormater(style, column) {
    if (!style) {
      return this.defaultCellFormater;
    }

    if (style.type === 'hidden') {
      return v => {
        return undefined;
      };
    }

    if (style.type === 'date') {
      return v => {
        if (_.isArray(v)) { v = v[0]; }
        var date = moment(v);
        if (this.isUtc) {
          date = date.utc();
        }
        return date.format(style.dateFormat);
      };
    }

    if (style.type === 'number') {
      let valueFormater = kbn.valueFormats[column.unit || style.unit];

      return v =>  {
        if (v === null || v === void 0) {
          return '-';
        }

        if (_.isString(v)) {
          return this.defaultCellFormater(v, style);
        }

        if (style.colorMode) {
          this.colorState[style.colorMode] = this.getColorForValue(v, style);
        }

        return valueFormater(v, style.decimals, null);
      };
    }

    if (style.type === 'string') {
      return v => {
        var stringStyle = _.merge({}, style);
        if (style.colorMode) {
          stringStyle.thresholds = _.map(stringStyle.thresholds, function(str) {
            return kbn.stringToJsRegex(str.trim());
          });
          this.colorState[stringStyle.colorMode] = this.getColorForValue(v, stringStyle);
        }
        return this.defaultCellFormater(v, stringStyle);
      };
    }

    return (value) => {
      return this.defaultCellFormater(value, style);
    };
  }

  formatColumnValue(colIndex, value) {
    if (colIndex === -1) {
      let style = { "type" : "string"};
      return this.defaultCellFormater(value, style);
    }

    if (this.formaters[colIndex]) {
      return this.formaters[colIndex](value);
    }

    for (let i = 0; i < this.panel.styles.length; i++) {
      let style = this.panel.styles[i];
      let column = this.table.columns[colIndex];
      var regex = kbn.stringToJsRegex(style.pattern);
      if (column.text.match(regex)) {
        this.formaters[colIndex] = this.createColumnFormater(style, column);
        return this.formaters[colIndex](value);
      }
    }

    this.formaters[colIndex] = this.defaultCellFormater;
    return this.formaters[colIndex](value);
  }

  renderCell(columnIndex, value, addWidthHack = false, rowLink = '') {
    value = this.formatColumnValue(columnIndex, value);
    var style = '';

    if (rowLink !== '') {
      value = '<a href="' + rowLink + '" target="_new">' + value + '</a>';
    }
    if (this.colorState.cell) {
      style = ' style="background-color:' + this.colorState.cell + ';color: white"';
      this.colorState.cell = null;
    } else if (this.colorState.value) {
      style = ' style="color:' + this.colorState.value + '"';
      this.colorState.value = null;
    }

    // because of the fixed table headers css only solution
    // there is an issue if header cell is wider the cell
    // this hack adds header content to cell (not visible)
    var widthHack = '';
    if (addWidthHack) {
      widthHack = '<div class="table-panel-width-hack">' + this.table.columns[columnIndex].text + '</div>';
    }

    if (value === undefined && columnIndex > 0) {
      style = ' style="display:none;"';
      this.table.columns[columnIndex].hidden = true;
    } else {
      this.table.columns[columnIndex].hidden = false;
    }

    return '<td' + style + '>' + value + widthHack + '</td>';
  }

  render(page) {
    let pageSize = this.panel.pageSize || 100;
    let startPos = page * pageSize;
    var html = "";

    if (this.panel.transpose) {
      let endPos = Math.min(startPos + pageSize, this.table.columns.length);

      for (var y = startPos; y < endPos; y++) {
        console.log(y);
        let cellHtml = this.renderCell(-1, this.table.columns[y].text, false);
        console.log(cellHtml);
        let rowStyle = '';

        for (var i = 0; i < this.table.rows.length; i++) {
          cellHtml += this.renderCell(y, this.table.rows[i][y]);
        }

        if (this.colorState.row) {
          rowStyle = ' style="background-color:' + this.colorState.row + ';color: white"';
          this.colorState.row = null;
        }

        html += '<tr ' + rowStyle + '>' + cellHtml + '</tr>';
      }
    } else {

      let endPos = Math.min(startPos + pageSize, this.table.rows.length);
      for (var y = startPos; y < endPos; y++) {
        let row = this.table.rows[y];
        let cellHtml = '';
        let rowStyle = '';
        let rowLink = this.panel.rowLink;


        if (rowLink) {
          for (var i = 0; i < this.table.columns.length; i++) {
            rowLink = rowLink.replace('$' + this.table.columns[i].text, _.escape(row[i]));
          }
        }


        for (var i = 0; i < this.table.columns.length; i++) {
          cellHtml += this.renderCell(i, row[i], y === startPos, rowLink);
        }

        if (this.colorState.row) {
          rowStyle = ' style="background-color:' + this.colorState.row + ';color: white"';
          this.colorState.row = null;
        }

        html += '<tr ' + rowStyle + '>' + cellHtml + '</tr>';
      }
    }

    return html;
  }
}
