﻿"use strict";

/* CellEditorView.js
 *
 * Author: Dmitry.Sokolov@avsmedia.net
 * Date:   May 30, 2012
 */
(	/**
	 * @param {jQuery} $
	 * @param {Window} window
	 * @param {undefined} undefined
	 */
	function($, window, undefined) {


		/*
		 * Import
		 * -----------------------------------------------------------------------------
		 */
		var asc = window["Asc"];

		var asc_calcnpt = asc.calcNearestPt;
		var asc_getcvt  = asc.getCvtRatio;
		var asc_round   = asc.round;
		var asc_search  = asc.search;
		var asc_lastidx = asc.lastIndexOf;

		var asc_HL = asc.HandlersList;
		var asc_DC = asc.DrawingContext;
		var asc_TR = asc.CellTextRender;
		var asc_FP = asc.FontProperties;
		var asc_incDecFonSize = asc.incDecFonSize;


		/** @const */
		var kLeftAlign = "left";
		/** @const */
		var kRightAlign = "right";
		/** @const */
		var kCenterAlign = "center";

		/** @const */
		var kBeginOfLine = -1;
		/** @const */
		var kBeginOfText = -2;
		/** @const */
		var kEndOfLine   = -3;
		/** @const */
		var kEndOfText   = -4;
		/** @const */
		var kNextChar    = -5;
		/** @const */
		var kNextWord    = -6;
		/** @const */
		var kNextLine    = -7;
		/** @const */
		var kPrevChar    = -8;
		/** @const */
		var kPrevWord    = -9;
		/** @const */
		var kPrevLine    = -10;
		/** @const */
		var kPosition    = -11;	
		/** @const */
		var kPositionLength    = -12;

		/** @const */
		var kNewLine = "\n";


		/**
		 * CellEditor widget
		 * -----------------------------------------------------------------------------
		 * @constructor
		 * @param {Element} elem
		 * @param {Element} input
		 * @param {Array} fmgrGraphics
		 * @param {FontProperties} oFont
		 * @param {HandlersList} handlers
		 * @param {Object} settings  See CellEditor.defaults
		 */
		function CellEditor(elem, input, fmgrGraphics, oFont, handlers, settings) {
			if ( !(this instanceof CellEditor) ) {return new CellEditor(elem, input, fmgrGraphics, oFont, handlers, settings);}

			this.element = elem;
			this.input = input;
			this.handlers = new asc_HL(handlers);
			this.settings = $.extend(true, {}, this.defaults, settings);
			this.options = {};

			//---declaration---
			this.canvasOuter = undefined;
			this.canvasOuterStyle = undefined;
			this.canvas = undefined;
			this.canvasOverlay = undefined;
			this.cursor = undefined;
			this.cursorStyle = undefined;
			this.cursorTID = undefined;
			this.cursorPos = 0;
			this.topLineIndex = 0;
			this.m_oFont = oFont;
			this.fmgrGraphics = fmgrGraphics;
			this.drawingCtx = undefined;
			this.overlayCtx = undefined;
			this.textRender = undefined;
			this.textFlags = undefined;
			this.kx = 1;
			this.ky = 1;
			this.skipKeyPress = undefined;
			this.undoList = [];
			this.redoList = [];
			this.undoMode = false;
			this.undoAllMode = false;
			this.selectionBegin = -1;
			this.selectionEnd = -1;
			this.isSelectMode = false;
			this.hasCursor = false;
			this.hasFocus = false;
			this.newTextFormat = undefined;
			this.selectionTimer = undefined;
			this.enableKeyEvents = true;
			this.isTopLineActive = false;
			this.skipTLUpdate = true;
			this.isOpened = false;
			this.callTopLineMouseup = false;
			this.lastKeyCode = undefined;
			this.m_nEditorState		= null;			// Состояние редактора
			this.isUpdateValue = true;				// Обновлять ли состояние строки при вводе в TextArea

			// Функции, которые будем отключать
			this.fKeyDown		= null;
			this.fKeyPress		= null;
			this.fKeyUp			= null;
			this.fKeyMouseUp	= null;
			this.fKeyMouseMove	= null;
			//-----------------
			
			// Автоподстановка формул. Цвет селекта
			this.formulaSelectorColor = "rgba(105, 119, 62, 0.2)";

			this.objAutoComplete = {};

			this._init();

			return this;
		}

		CellEditor.prototype = {

			constructor: CellEditor,

			defaults: {
				background  : new CColor(255, 255, 255),
				font        : new asc_FP("Calibri", 11),
				padding     : 2,
				selectColor : new CColor(190, 190, 255, 0.5),
				textAlign   : kLeftAlign,
				textColor   : new CColor(0, 0, 0),

				canvasZindex  : "1000",
				blinkInterval : 500,
				cursorShape   : "text",

				selectionTimeout: 20
			},

			/** @type RegExp */
			reReplaceNL:  /\r?\n|\r/g,

			/** @type RegExp */
			reReplaceTab: /[\t\v\f]/g,

			// RegExp с поддержкой рэнджей вида $E1:$F2
			reRangeStr: "[^a-z0-9_$!:](\\$?[a-z]+\\$?\\d+:\\$?[a-z]+\\$?\\d+(?=[^a-z0-9_]|$)|\\$?[a-z]+:\\$?[a-z]+(?=[^a-z0-9_]|$)|\\$?\\d+:\\$?\\d+(?=[^a-z0-9_]|$)|\\$?[a-z]+\\$?\\d+(?=[^a-z0-9_]|$))",

			rangeChars: "= - + * / ( { , < > ^ ! & : ;".split(' '),

            reNotFormula: /[^a-z0-9_]/i,

            reFormula: /^([a-z_][a-z0-9_]*)/i,

			_init: function () {
				var t = this;
				var z = parseInt(t.settings.canvasZindex);

				if (null != this.element) {
					t.canvasOuter = document.createElement('div');
					t.canvasOuter.id = "ce-canvas-outer";
					t.canvasOuter.style.display = "none";
					t.canvasOuter.style.zIndex = z;
					var innerHTML = '<canvas id="ce-canvas" style="z-index: ' + (z+1) + '"></canvas>';
					innerHTML += '<canvas id="ce-canvas-overlay" style="z-index: ' + (z+2) + '; cursor: ' + t.settings.cursorShape + '"></canvas>';
					innerHTML += '<div id="ce-cursor" style="display: none; z-index: ' + (z+3) + '"></div>';
					t.canvasOuter.innerHTML = innerHTML;
					this.element.appendChild(t.canvasOuter);

					t.canvasOuterStyle = t.canvasOuter.style;
					t.canvas = document.getElementById("ce-canvas");
					t.canvasOverlay = document.getElementById("ce-canvas-overlay");
					t.cursor = document.getElementById("ce-cursor");
					t.cursorStyle = t.cursor.style;
				}

				// create text render
				t.drawingCtx = asc_DC({canvas: t.canvas, units: 1/*pt*/, fmgrGraphics: this.fmgrGraphics, font: this.m_oFont});
				t.overlayCtx = asc_DC({canvas: t.canvasOverlay, units: 1/*pt*/, fmgrGraphics: this.fmgrGraphics, font: this.m_oFont});
				t.textRender = asc_TR(t.drawingCtx);
				t.textRender.setDefaultFont(t.settings.font.clone());

				// bind event handlers
				if (t.canvasOverlay && t.canvasOverlay.addEventListener) {
					t.canvasOverlay.addEventListener("mousedown"	, function () {return t._onMouseDown.apply(t, arguments);}		, false);
					t.canvasOverlay.addEventListener("mouseup"		, function () {return t._onMouseUp.apply(t, arguments);}		, false);
					t.canvasOverlay.addEventListener("mousemove"	, function () {return t._onMouseMove.apply(t, arguments);}		, false);
					t.canvasOverlay.addEventListener("mouseleave"	, function () {return t._onMouseLeave.apply(t, arguments);}		, false);
					t.canvasOverlay.addEventListener("dblclick"		, function () {return t._onMouseDblClick.apply(t, arguments);}	, false);
				}

				// check input, it may have zero len, for mobile version
				if (t.input && t.input.addEventListener) {
					t.input.addEventListener("focus"	, function () {return t.isOpened ? t._topLineGotFocus.apply(t, arguments) : true;}	, false);
					t.input.addEventListener("mousedown", function () {return t.isOpened ? (t.callTopLineMouseup = true) : true;}			, false);
					t.input.addEventListener("mouseup"	, function () {return t.isOpened ? t._topLineMouseUp.apply(t, arguments) : true;}	, false);
					t.input.addEventListener("input"	, function () {return t._onInputTextArea.apply(t, arguments);}						, false);

					// Не поддерживаем drop на верхнюю строку
					t.input.addEventListener("drop"		, function (e) {e.preventDefault(); return false;}									, false);
				}

				this.fKeyDown		= function () {
					t._keyDownFormulaSelector.apply(t, arguments);
					return t._onWindowKeyDown.apply(t, arguments);
				};
				this.fKeyPress		= function () {return t._onWindowKeyPress.apply(t, arguments);};
				this.fKeyUp			= function () {return t._onWindowKeyUp.apply(t, arguments);};
				this.fKeyMouseUp	= function () {return t._onWindowMouseUp.apply(t, arguments);};
				this.fKeyMouseMove	= function () {return t._onWindowMouseMove.apply(t, arguments);};
			},

			destroy: function() {
			},

			/**
			 * @param {Object} options
			 *   cellX - cell x coord (pt)
			 *   cellY - cell y coord (pt)
			 *   leftSide   - array
			 *   rightSide  - array
			 *   bottomSide - array
			 *   fragments  - text fragments
			 *   flags      - text flags (wrapText, textAlign)
			 *   font
			 *   background
			 *   textColor
			 *   selectColor
			 *   saveValueCallback
			 */
			open: function (options) {
				var t = this;
				t.isOpened = true;
				if (window.addEventListener) {
					window.addEventListener("keydown"	, this.fKeyDown		, false);
					window.addEventListener("keypress"	, this.fKeyPress	, false);
					window.addEventListener("keyup"		, this.fKeyUp		, false);
					window.addEventListener("mouseup"	, this.fKeyMouseUp	, false);
					window.addEventListener("mousemove"	, this.fKeyMouseMove, false);
				}
				t._setOptions(options);
				t.isTopLineActive = true === t.input.isFocused;
				t._draw();
				if (!(options.cursorPos >= 0)) {
					if (options.isClearCell)
						t._selectChars(kEndOfText);
					else
						t._moveCursor(kEndOfText);
				}
				/*
				 * Выставляем фокус при открытии
				 * При нажатии символа, фокус не ставим
				 * При F2 выставляем фокус в редакторе
				 * При dbl клике фокус выставляем в зависимости от наличия текста в ячейке
				 */
				t.setFocus(t.isTopLineActive ? true : (undefined !== options.focus) ? options.focus : t._haveTextInEdit() ? true : false);
				t._updateFormulaEditMod(/*bIsOpen*/true);
				t._updateUndoRedoChanged();
			},

			close: function (saveValue) {
				var t = this, opt = t.options, ret = false;

				if (saveValue && "function" === typeof opt.saveValueCallback) {
					ret = t._wrapFragments(opt.fragments); // восстанавливаем символы \n
					ret = opt.saveValueCallback(opt.fragments, t.textFlags, /*skip NL check*/ret);
					if (!ret) {return false;}
				}

				t.isOpened = false;
				if (window.removeEventListener) {
					window.removeEventListener("keydown"	, this.fKeyDown		, false);
					window.removeEventListener("keypress"	, this.fKeyPress	, false);
					window.removeEventListener("keyup"		, this.fKeyUp		, false);
					window.removeEventListener("mouseup"	, this.fKeyMouseUp	, false);
					window.removeEventListener("mousemove"	, this.fKeyMouseMove, false);
				}
				t.input.blur();
				t.isTopLineActive = false;
				t.input.isFocused = false;
				t._hideCursor();
				// hide
				t.canvasOuterStyle.display = "none";

				// delete autoComplete
				this.objAutoComplete = {};

				t.handlers.trigger("closed");
				return true;
			},

			setTextStyle: function (prop, val) {
				var t = this, opt = t.options, begin, end, i, first, last;

				if (t.selectionBegin !== t.selectionEnd) {

					begin = Math.min(t.selectionBegin, t.selectionEnd);
					end = Math.max(t.selectionBegin, t.selectionEnd);

					// save info to undo/redo
					if (end - begin < 2) {
						t.undoList.push({fn: t._addChars, args: [t.textRender.getChars(begin, 1), begin]});
					} else {
						t.undoList.push({fn: t._addFragments, args: [t._getFragments(begin, end - begin), begin]});
					}

					t._extractFragments(begin, end - begin);

					first = t._findFragment(begin);
					last = t._findFragment(end - 1);

					if (first && last) {
						for (i = first.index; i <= last.index; ++i) {
							var valTmp = t._setFormatProperty(opt.fragments[i].format, prop, val);
							// Только для горячих клавиш
							if (null === val)
								val = valTmp;
						}
						// merge fragments with equal formats
						t._mergeFragments();
						t._update();

						// Обновляем выделение
						t._cleanSelection();
						t._drawSelection();

						// save info to undo/redo
						t.undoList.push({fn: t._removeChars, args: [begin, end - begin]});
						t.redoList = [];
					}

				} else {

					first = t._findFragmentToInsertInto(t.cursorPos);
					if (first) {
						if (!t.newTextFormat) {
							t.newTextFormat = opt.fragments[first.index].format.clone();
						}
						t._setFormatProperty(t.newTextFormat, prop, val);
					}

				}
			},

			empty: function(options) {
				// Чистка для редактирования только All
				if (c_oAscCleanOptions.All !== options)
					return;

				// Удаляем только selection
				this._removeChars();
			},

			undo: function () {
				this._performAction(this.undoList, this.redoList);
			},

			undoAll: function () {
				this.undoAllMode = true;
				while (this.undoList.length > 0) {
					this.undo();
				}
				this.undoAllMode = false;
				this._update();
			},

			redo: function () {
				this._performAction(this.redoList, this.undoList);
			},

			getZoom: function () {
				return this.drawingCtx.getZoom();
			},

			changeZoom: function (factor) {
				this.drawingCtx.changeZoom(factor);
				this.overlayCtx.changeZoom(factor);
			},

			canEnterCellRange: function () {
				var isRange = this._findRangeUnderCursor().range !== null;
				var prevChar = this.textRender.getChars(this.cursorPos-1, 1);
				return isRange || this.rangeChars.indexOf(prevChar) >= 0;
			},

			activateCellRange: function () {
				var res = this._findRangeUnderCursor();

				res.range ?
						this.handlers.trigger("existedRange", res.range) :
						this.handlers.trigger("newRange");
			},

			enterCellRange: function (rangeStr) {
				var t = this;
				var res = t._findRangeUnderCursor();

				if (res.range) {
					t._moveCursor(kPosition, res.index);
					t._selectChars(kPosition, res.index + res.length);
				}

				var lastAction = t.undoList.length > 0 ? t.undoList[t.undoList.length - 1] : null;

				while (lastAction && lastAction.isRange) {
					t.undoList.pop();
					lastAction = t.undoList.length > 0 ? t.undoList[t.undoList.length - 1] : null;
				}

				t._addChars(rangeStr, undefined, /*isRange*/true);
			},
			
			changeCellRange: function(range,rangeStr){
				var t = this;
				t._moveCursor(kPosition, range.cursorePos/* -length */);
				t._selectChars(kPositionLength, range.formulaRangeLength);
				t._addChars(rangeStr, undefined, /*isRange*/true);
				t._moveCursor(kEndOfText);
			},
			
			move: function (dx, dy) {
				var t = this;
				var opt = t.options;

				t.left += dx;
				t.right += dx;
				t.top += dy;
				t.bottom += dy;

				opt.leftSide.forEach(function (e,i,a) {a[i] = e + dx;});
				opt.rightSide.forEach(function (e,i,a) {a[i] = e + dx;});
				opt.bottomSide.forEach(function (e,i,a) {a[i] = e + dy;});

				// ToDo выставлять опции (т.к. при scroll редактор должен пересчитываться)
				t._adjustCanvas();
				t._renderText();
				t._drawSelection();
			},

			setFocus: function (hasFocus) {
				this.hasFocus = !!hasFocus;
				this.handlers.trigger("gotFocus", this.hasFocus);
			},

			restoreFocus: function () {
				if (this.isTopLineActive) {
					this.input.focus();
				}
			},

			copySelection: function () {
				var t = this;
				var res = null;
				if(t.selectionBegin !== t.selectionEnd)
				{
					var start = t.selectionBegin;
					var end = t.selectionEnd;
					if(start > end)
					{
						var temp = start;
						start = end;
						end = temp;
					}
					res = t._getFragments(start, end - start);
				}
				return res;
			},

			cutSelection: function () {
				var t = this;
				var f = null;
				if (t.selectionBegin !== t.selectionEnd) {
					var start = t.selectionBegin;
					var end = t.selectionEnd;
					if(start > end)
					{
						var temp = start;
						start = end;
						end = temp;
					}
					f = t._getFragments(start, end - start);
					t._removeChars();
				}
				return f;
			},

			pasteText: function (text) {
				var t = this;
				text = text.replace(/\t/g," ");
				text = text.replace(/\r/g, "");
				text = text.replace(/^\n+|\n+$/g, "");
				var wrap = text.indexOf("\n") >= 0;

				if (!(text.length > 0)) {return;}

				if (t.selectionBegin !== t.selectionEnd)
					t._removeChars();
				else
					t.undoList.push({fn: "fake", args: []});//фейковый undo(потому что у нас делает undo по 2 действия)

				// save info to undo/redo
				t.undoList.push({fn: t._removeChars, args: [t.cursorPos, text.length]});
				t.redoList = [];

				var opt = t.options;
				var nInsertPos = t.cursorPos;
				var fr;
				fr = t._findFragmentToInsertInto(nInsertPos - (nInsertPos > 0 ? 1 : 0));
				if (fr) {
					var oCurFragment = opt.fragments[fr.index];
					if(fr.end <= nInsertPos)
						oCurFragment.text += text;
					else
					{
						var sNewText = oCurFragment.text.substring(0, nInsertPos);
						sNewText += text;
						sNewText += oCurFragment.text.substring(nInsertPos);
						oCurFragment.text = sNewText;
					}
					t.cursorPos = nInsertPos + text.length;
					t._update();
				}

				if (wrap) {
					t._wrapText();
					t._update();
				}
			},

			paste: function (fragments, cursorPos) {
				var t = this;
				var wrap = fragments.some(function(val){return val.text.indexOf("\n")>=0;});

				t._cleanFragments(fragments);

				if (!(fragments.length > 0)) {return;}

				if (t.selectionBegin !== t.selectionEnd) {t._removeChars();}

				// save info to undo/redo
				t.undoList.push({fn: t._removeChars, args: [t.cursorPos, t._getFragmentsLength(fragments)]});
				t.redoList = [];

				t._addFragments(fragments, t.cursorPos);

				if (wrap) {
					t._wrapText();
					t._update();
				}

				// Сделано только для вставки формулы в ячейку (когда не открыт редактор)
				if (undefined !== cursorPos)
					t._moveCursor(kPosition, cursorPos);
			},

			/** @param flag {Boolean} */
			enableKeyEventsHandler: function (flag) {
				this.enableKeyEvents = !!flag;
			},

			isFormula: function() {
				var fragments = this.options.fragments;
				return fragments.length > 0 && fragments[0].text.length > 0 && fragments[0].text.charAt(0) === "=";
			},

			insertFormula: function (functionName) {
				// Проверим форула ли это
				if (false === this.isFormula()) {
					// Может это просто текста нет
					var fragments = this.options.fragments;
					if (1 === fragments.length && 0 === fragments[0].text.length) {
						// Это просто нет текста, добавим форумулу
						functionName = "=" + functionName + "()";
					}
					else {
						// Не смогли добавить...
						return false;
					}
				}
				else {
					// Это уже форула, добавляем без '='
					functionName = functionName + "()";
				}

				this.skipTLUpdate = false;
				// Вставим форумулу в текущую позицию
				this._addChars (functionName);
				// Меняем позицию курсора внутрь скобок
				this._moveCursor (kPosition, this.cursorPos - 1);
			},

			replaceText: function (pos, len, newText) {
				this._moveCursor(kPosition, pos);
				this._selectChars(kPosition, pos + len);
				this._addChars(newText);
			},

			setFontRenderingMode: function () {
				if (this.isOpened)
					this._draw();
			},

			// Private

			_setOptions: function (options) {

				function cmpNum(a, b) {return a - b;}
				function cmpNumRev(a, b) {return b - a;}

				var t = this;
				var opt = t.options = $.extend(true, {}, t.settings, options);
				var ctx = t.drawingCtx;
				var u = ctx.getUnits();

				t.textFlags = $.extend(true, {}, opt.flags);
				if (t.textFlags.textAlign.toLowerCase() === "justify" || this.isFormula()) {
					t.textFlags.textAlign = "left";
				}
				if (t.textFlags.wrapText) {
					t.textFlags.wrapOnlyNL = true;
					t.textFlags.wrapText = false;
				}

				t._cleanFragments(opt.fragments);
				t.textRender.setString(opt.fragments, t.textFlags);
				delete t.newTextFormat;

				if (opt.zoom > 0) {
					t.overlayCtx.setFont(t.drawingCtx.getFont());
					t.changeZoom(opt.zoom);
				}

				t.kx = asc_getcvt(u, 0/*px*/, ctx.getPPIX());
				t.ky = asc_getcvt(u, 0/*px*/, ctx.getPPIY());

				opt.leftSide.sort(cmpNumRev);
				opt.rightSide.sort(cmpNum);
				opt.bottomSide.sort(cmpNum);

				t.left = opt.cellX;
				t.top = opt.cellY;
				t.right = opt.rightSide[0];
				t.bottom = opt.bottomSide[0];

				t.cursorPos = opt.cursorPos !== undefined ? opt.cursorPos : 0;
				t.topLineIndex = 0;
				t.selectionBegin = -1;
				t.selectionEnd = -1;
				t.isSelectMode = false;
				t.hasCursor = false;

				t.undoList = [];
				t.redoList = [];
				t.undoMode = false;
				t.skipKeyPress = false;
			},

			_parseRangeStr: function (s) {
				var p, range, ca1, ca2;

				p = s.replace(/\$/g, "").split(":");
				if (p.length > 1) {
					ca1 = new CellAddress(p[0]);
					ca2 = new CellAddress(p[1]);
					if (!ca1 || !ca1.isValid() || !ca2 || !ca2.isValid()) { return null; }
					range = asc.Range(ca1.getCol0(), ca1.getRow0(), ca2.getCol0(), ca2.getRow0());
					if (range.r2 === gc_nMaxRow0) {              // range вида A:C
						range.r1 = 0;
						range.type = c_oAscSelectionType.RangeCol;
					} else if (range.c2 === gc_nMaxCol0) {       // range вида 1:5
						range.c1 = 0;
						range.type = c_oAscSelectionType.RangeRow;
					} else {                                     // range вида A1:C5
						range.type = c_oAscSelectionType.RangeCells;
					}
				} else {                                       // range вида A1
					ca1 = new CellAddress(p[0]);
					if (!ca1 || !ca1.isValid()) { return null; }
					range = asc.Range(ca1.getCol0(), ca1.getRow0(), ca1.getCol0(), ca1.getRow0());
					range.type = c_oAscSelectionType.RangeCells;
				}
				range.startCol = range.c1;
				range.startRow = range.r1;
				return range;
			},

			_parseFormulaRanges: function () {
				var s = this._getFragmentsText(this.options.fragments);

				// в Chrome 23 есть баг в RegExp с флагом "g" - не обнуляется lastIndex
				// поэтому используем такую хитрую конструкцию re[reIdx]
				var reIdx = 0;
				var re = [new RegExp(this.reRangeStr, "gi")];

				var ret = false;
				var m, range, i;

				if (s.length < 1 || s.charAt(0) !== "=") {
					return ret;
				}

				while (null !== (m = re[reIdx].exec(s))) {
					range = this._parseRangeStr(m[1]);
					if (range) {
						ret = true;
						if( m[1].indexOf("$") > -1 ){
							range.isAbsolute = m[1];
						}
						range.cursorePos = m.input.indexOf(m[0])+1;
						range.formulaRangeLength = m[1].length;
						this.handlers.trigger("newRange", range);
					} else {
						i = m[1].indexOf(":");
						if (i >= 0) {
							s = "(" + s.slice(m.index + 1 + i + 1);
							reIdx = re.length;
							re.push(new RegExp(this.reRangeStr, "gi"));
						}
					}
				}
				return ret;
			},

			_findRangeUnderCursor: function () {
				var t = this;
				var s = t.textRender.getChars(0, t.textRender.getCharsCount());
				var re = new RegExp("^" + this.reRangeStr, "i");
				var reW = /[^a-z0-9_$]/i;
				var beg = t.cursorPos - 1;
				var colon = -1;
				var ch, res, range;

				for (; beg >= 0; --beg) {
					ch = s.charAt(beg);
					if (!reW.test(ch)) {
						continue;
					}
					res = s.slice(beg).match(re);
					if (ch === ":" && colon < 0) {
						if (!res || res[1].indexOf(":") < 0) {
							colon = beg;
							continue;
						}
					}
					if (res && t.cursorPos > beg + res.index && t.cursorPos <= beg + res.index + res[0].length) {
						range = t._parseRangeStr(res[1]);
						if (!range) {
							beg = colon;
							res = s.slice(beg).match(re);
							if (res && t.cursorPos > beg + res.index && t.cursorPos <= beg + res.index + res[0].length) {
								range = t._parseRangeStr(res[1]);
							}
						}
					}
					break;
				}
				return !range ?
						{index: -1, length: 0, range: null} :
						{index: beg + res.index + 1, length: res[1].length, range: range};
			},

			_updateFormulaEditMod: function (bIsOpen) {
				var isFormula = this.isFormula();
				if (!bIsOpen)
					this._updateEditorState(isFormula);
				this.handlers.trigger("updateFormulaEditMod", isFormula);
				var ret1 = this._parseFormulaRanges();
				var ret2 = this.canEnterCellRange();
				this.handlers.trigger("updateFormulaEditModEnd", ret1 || ret2);
			},

			// Обновляем состояние Undo/Redo
			_updateUndoRedoChanged: function () {
				this.handlers.trigger("updateUndoRedoChanged", 0 < this.undoList.length, 0 < this.redoList.length);
			},

			_haveTextInEdit: function () {
				var fragments = this.options.fragments;
				return fragments.length > 0 && fragments[0].text.length > 0;
			},

			_updateEditorState: function (isFormula) {
				if (undefined === isFormula)
					isFormula = this.isFormula();
				var editorState = isFormula ? c_oAscCellEditorState.editFormula :
					"" === this._getFragmentsText(this.options.fragments) ? c_oAscCellEditorState.editEmptyCell :
						c_oAscCellEditorState.editText;

				if (this.m_nEditorState !== editorState) {
					this.m_nEditorState = editorState;
					this.handlers.trigger("updateEditorState", this.m_nEditorState);
				}
			},

			// Rendering

			_draw: function () {
				var t = this, opt = t.options, canExpW = true, canExpH = true, tm, expW, expH;

				if (opt.fragments.length > 0) {
					tm = t.textRender.measureString(opt.fragments, t.textFlags, t._getContentWidth());
					expW = tm.width > t._getContentWidth();
					expH  = tm.height > t._getContentHeight();

					while (expW && canExpW || expH && canExpH) {
						if (expW) { canExpW = t._expandWidth(); }
						if (expH) { canExpH = t._expandHeight(); }

						if (!canExpW) {
							t.textFlags.wrapText = true;
							tm = t.textRender.measureString(opt.fragments, t.textFlags, t._getContentWidth());
						} else {
							tm = t.textRender.measure(t._getContentWidth());
						}
						expW = tm.width > t._getContentWidth();
						expH  = tm.height > t._getContentHeight();
					}
				}

				t._cleanText();
				t._cleanSelection();
				t._adjustCanvas();
				t._renderText();
				t.input.value = t._getFragmentsText(opt.fragments);
				t._updateCursorPosition();
				t._showCursor();
			},

			_update: function () {
				var t = this, opt = t.options, tm, canExpW, canExpH, oldLC, doAjust = false;

				if (opt.fragments.length > 0) {
					oldLC = t.textRender.getLinesCount();
					tm = t.textRender.measureString(opt.fragments, t.textFlags, t._getContentWidth());
					if (t.textRender.getLinesCount() < oldLC) {
						t.topLineIndex -= oldLC - t.textRender.getLinesCount();
					}

					canExpW = !t.textFlags.wrapText;
					while (tm.width > t._getContentWidth() && canExpW) {
						canExpW = t._expandWidth();
						if (!canExpW) {
							t.textFlags.wrapText = true;
							tm = t.textRender.measureString(opt.fragments, t.textFlags, t._getContentWidth());
						}
						doAjust = true;
					}

					canExpH = true;
					while (tm.height > t._getContentHeight() && canExpH) {
						canExpH = t._expandHeight();
						doAjust = true;
					}
					if (t.textRender.isLastCharNL() && !doAjust && canExpH) {
						var lm = t.textRender.calcCharHeight(t.textRender.getCharsCount() - 1);
						if (tm.height + lm.th > t._getContentHeight()) {
							t._expandHeight();
							doAjust = true;
						}
					}
				}
				if (doAjust) {t._adjustCanvas();}
				t._renderText();  // вызов нужен для пересчета поля line.startX, которое используется в _updateCursorPosition
				t._fireUpdated(); // вызов нужен для обновление текста верхней строки, перед обновлением позиции курсора
				t._updateCursorPosition(true);
				t._showCursor();

				t._updateFormulaEditMod(/*bIsOpen*/false);
				t._updateUndoRedoChanged();
			},

            _fireUpdated: function () {
				var t = this;
				var s = t._getFragmentsText(t.options.fragments);
				var isFormula = s.charAt(0) === "=";
				var funcPos, funcName, match;

				if (!t.isTopLineActive || !t.skipTLUpdate || t.undoMode) {
					t.input.value = s;
				}

				if (isFormula) {
					funcPos = asc_lastidx(s, t.reNotFormula, t.cursorPos) + 1;
					if (funcPos > 0) {
						match = s.slice(funcPos).match( t.reFormula );
					}
					if (match) {
						funcName = match[1];
					} else {
						funcPos = undefined;
						funcName = undefined;
					}
				}

				t.handlers.trigger("updated", s, t.cursorPos, isFormula, funcPos, funcName);
			},

			_expandWidth: function () {
				var t = this, opt = t.options, l = false, r = false;

				function expandLeftSide() {
					var i = asc_search(opt.leftSide, function (v) {return v < t.left;});
					if (i >= 0) {
						t.left = opt.leftSide[i];
						return true;
					}
					var val = opt.leftSide[opt.leftSide.length - 1];
					if (Math.abs(t.left - val) > 0.000001) { // left !== leftSide[len-1]
						t.left = val;
					}
					return false;
				}

				function expandRightSide() {
					var i = asc_search(opt.rightSide, function (v) {return v > t.right;});
					if (i >= 0) {
						t.right = opt.rightSide[i];
						return true;
					}
					var val = opt.rightSide[opt.rightSide.length - 1];
					if (Math.abs(t.right - val) > 0.000001) { // right !== rightSide[len-1]
						t.right = val;
					}
					return false;
				}

				switch (t.textFlags.textAlign) {
					case kRightAlign:r = expandLeftSide();break;
					case kCenterAlign:l = expandLeftSide();r = expandRightSide();break;
					case kLeftAlign:
					default:r = expandRightSide();
				}
				return l || r;
			},

			_expandHeight: function () {
				var t = this, opt = t.options, i = asc_search(opt.bottomSide, function (v) {return v > t.bottom;});
				if (i >= 0) {
					t.bottom = opt.bottomSide[i];
					return true;
				}
				var val = opt.bottomSide[opt.bottomSide.length - 1];
				if (Math.abs(t.bottom - val) > 0.000001) { // bottom !== bottomSide[len-1]
					t.bottom = val;
				}
				return false;
			},

			_cleanText: function () {
				this.drawingCtx.clear();
			},

			_adjustCanvas: function () {
				var t = this;
				var z = parseInt(t.settings.canvasZindex);

				t.canvasOuterStyle.left = (t.left * t.kx) + "px";
				t.canvasOuterStyle.top = (t.top * t.ky) + "px";
				t.canvasOuterStyle.width = ((t.right - t.left) * t.kx - 1) + "px";
				t.canvasOuterStyle.height = ((t.bottom - t.top) * t.ky - 1) + "px";
				t.canvasOuterStyle.zIndex = t.top <= 0 ? -1 : z;

				t.canvas.width = t.canvasOverlay.width = (t.right - t.left) * t.kx - 1;
				t.canvas.height = t.canvasOverlay.height = (t.bottom - t.top) * t.ky - 1;

				// show
				t.canvasOuterStyle.display = "block";
			},

			_renderText: function (dy) {
				var t = this, opt = t.options, ctx = t.drawingCtx;

				ctx.setFillStyle(opt.background)
				   .fillRect(0, 0, ctx.getWidth(), ctx.getHeight());

				if (opt.fragments.length > 0) {
					t.textRender.render(t._getContentLeft(), -ctx._1px_y + (dy === undefined ? 0 : dy), t._getContentWidth(), opt.textColor);
				}
			},

			_cleanSelection: function () {
				this.overlayCtx.clear();
			},

			_drawSelection: function () {
				var t = this, opt = t.options, ctx = t.overlayCtx, ppix = ctx.getPPIX(), ppiy = ctx.getPPIY();
				var begPos, endPos, top, top1, top2, begInfo, endInfo, line1, line2, i;

				function drawRect(x, y, w, h) {
					ctx.fillRect(
							asc_calcnpt(x, ppix), asc_calcnpt(y, ppiy),
							asc_calcnpt(w, ppix), asc_calcnpt(h, ppiy));
				}

				begPos = t.selectionBegin;
				endPos = t.selectionEnd;

				ctx.setFillStyle(opt.selectColor)
						.clear();

				if (begPos !== endPos && !t.isTopLineActive) {
					top = t.textRender.calcLineOffset(t.topLineIndex);
					begInfo = t.textRender.calcCharOffset(Math.min(begPos, endPos));
					line1 = t.textRender.getLineInfo(begInfo.lineIndex);
					top1 = t.textRender.calcLineOffset(begInfo.lineIndex);
					endInfo = t.textRender.calcCharOffset(Math.max(begPos, endPos));
					if (begInfo.lineIndex === endInfo.lineIndex) {
						drawRect(begInfo.left, top1 - top, endInfo.left - begInfo.left, line1.th);
					} else {
						line2 = t.textRender.getLineInfo(endInfo.lineIndex);
						top2 = t.textRender.calcLineOffset(endInfo.lineIndex);
						drawRect(begInfo.left, top1 - top, line1.tw - begInfo.left + line1.startX, line1.th);
						if (line2) {drawRect(line2.startX, top2 - top, endInfo.left - line2.startX, line2.th);}
						top = top1 - top + line1.th;
						for (i = begInfo.lineIndex + 1; i < endInfo.lineIndex; ++i, top += line1.th) {
							line1 = t.textRender.getLineInfo(i);
							drawRect(line1.startX, top, line1.tw, line1.th);
						}
					}
				}
			},

			// Cursor

			showCursor: function () {
				if (!this.options) {this.options = {};}
				this.options.isHideCursor = false;
				this._showCursor();
			},

			_showCursor: function () {
				var t = this;
				if (true === t.options.isHideCursor || t.isTopLineActive === true) {return;}
				window.clearInterval(t.cursorTID);
				t.cursorStyle.display = "block";
				t.cursorTID = window.setInterval(function () {
					t.cursorStyle.display = ("none" === t.cursorStyle.display) ? "block" : "none";
				}, t.settings.blinkInterval);
			},

			_hideCursor: function () {
				var t = this;
				window.clearInterval(t.cursorTID);
				t.cursorStyle.display = "none";
			},

			_updateCursorPosition: function (redrawText) {
				var t = this;
				var h = t.canvas.height;
				var y = - t.textRender.calcLineOffset(t.topLineIndex);
				var cur = t.textRender.calcCharOffset(t.cursorPos);
				var charsCount = t.textRender.getCharsCount();
				var curLeft = asc_round(((kRightAlign !== t.textFlags.textAlign || t.cursorPos !== charsCount) && cur !== null && cur.left !== null ? cur.left : t._getContentPosition()) * t.kx);
				var curTop  = asc_round(((cur !== null ? cur.top : 0) + y) * t.ky);
				var curHeight = asc_round((cur !== null ? cur.height : t.options.font.FontSize) * 1.275 * t.ky);
				var i, dy;

				while (t.textRender.getLinesCount() > 1) {
					if (curTop + curHeight - 1 > h) {
						i = i === undefined ? 0 : i + 1;
						dy = t.textRender.getLineInfo(i).th;
						y -= dy;
						curTop -= asc_round(dy * t.ky);
						++t.topLineIndex;
						continue;
					}
					if (curTop < 0) {
						--t.topLineIndex;
						dy = t.textRender.getLineInfo(t.topLineIndex).th;
						y += dy;
						curTop += asc_round(dy * t.ky);
						continue;
					}
					break;
				}

				if (dy !== undefined || redrawText) {t._renderText(y);}

				t.cursorStyle.left = curLeft + "px";
				t.cursorStyle.top = curTop + "px";
				t.cursorStyle.height = curHeight + "px";

				if (cur) {t.input.scrollTop = t.input.clientHeight * cur.lineIndex;}
				if (t.isTopLineActive && !t.skipTLUpdate) {t._updateTopLineCurPos();}
			},

			_moveCursor: function (kind, pos) {
				var t = this;
				switch (kind) {
					case kPrevChar: t.cursorPos = t.textRender.getPrevChar(t.cursorPos); break;
					case kNextChar: t.cursorPos = t.textRender.getNextChar(t.cursorPos); break;
					case kPrevWord: t.cursorPos = t.textRender.getPrevWord(t.cursorPos); break;
					case kNextWord: t.cursorPos = t.textRender.getNextWord(t.cursorPos); break;
					case kBeginOfLine: t.cursorPos = t.textRender.getBeginOfLine(t.cursorPos); break;
					case kEndOfLine: t.cursorPos = t.textRender.getEndOfLine(t.cursorPos); break;
					case kBeginOfText: t.cursorPos = t.textRender.getBeginOfText(t.cursorPos); break;
					case kEndOfText: t.cursorPos = t.textRender.getEndOfText(t.cursorPos); break;
					case kPrevLine: t.cursorPos = t.textRender.getPrevLine(t.cursorPos); break;
					case kNextLine: t.cursorPos = t.textRender.getNextLine(t.cursorPos); break;
					case kPosition: t.cursorPos = pos; break;
					case kPositionLength: t.cursorPos += pos; break;
					default: return;
				}
				if (t.selectionBegin !== t.selectionEnd) {
					t.selectionBegin = t.selectionEnd = -1;
					t._cleanSelection();
				}
				t._updateCursorPosition();
				t._showCursor();
			},

			_findCursorPosition: function (coord) {
				var t = this;
				var lc = t.textRender.getLinesCount();
				var i, h, w, li, chw;
				for (h = 0, i = Math.max(t.topLineIndex, 0); i < lc; ++i) {
					li = t.textRender.getLineInfo(i);
					h += li.th;
					if (coord.y <= h) {
						for (w = li.startX, i = li.beg; i <= li.end; ++i) {
							chw = t.textRender.getCharWidth(i);
							if (coord.x <= w + chw) {
								return coord.x <= w + chw / 2 ? i : i + 1 > li.end ? kEndOfLine : i + 1;
							}
							w += chw;
						}
						return i < t.textRender.getCharsCount() ? i-1 : kEndOfText;
					}
				}
				return kNextLine;
			},

			_updateTopLineCurPos: function () {
				var t = this;
				var isSelected = t.selectionBegin !== t.selectionEnd;
				var b = isSelected ? t.selectionBegin : t.cursorPos;
				var e = isSelected ? t.selectionEnd : t.cursorPos;
				if (t.input.setSelectionRange) {t.input.setSelectionRange(Math.min(b, e), Math.max(b, e));}
			},

			_topLineGotFocus: function () {
				var t = this;
				t.isTopLineActive = true;
				t.input.isFocused = true;
				t.setFocus(true);
				t._hideCursor();
				t._updateTopLineCurPos();
				t._cleanSelection();
			},

			_topLineMouseUp: function () {
				var t = this;
				this.callTopLineMouseup = false;
				// при такой комбинации ctrl+a, click, ctrl+a, click не обновляется selectionStart
				// поэтому выполняем обработку после обработчика системы
				setTimeout(function () {
					var b = t.input.selectionStart;
					var e = t.input.selectionEnd;
					if (typeof b !== "undefined") {
						if (t.cursorPos !== b) {t._moveCursor(kPosition, b);}
						if (b !== e) {t._selectChars(kPosition, e);}
					}
				});
			},

			_syncEditors: function () {
				var t = this;
				var s1 = t._getFragmentsText(t.options.fragments);
				var s2 = t.input.value;
				var l = Math.min(s1.length, s2.length);
				var i1 = 0, i2 = 0;

				while (i1 < l && s1.charAt(i1) === s2.charAt(i1)) {++i1;}
				i2 = i1 + 1;
				if (i2 >= l) {i2 = Math.max(s1.length, s2.length);}
				else while (i2 < l && s1.charAt(i1) !== s2.charAt(i2)) {++i2;}

				t._addChars(s2.slice(i1, i2), i1);
			},

			// Content

			_getContentLeft: function () {
				var t = this, opt = t.options;
				return asc_calcnpt(0, t.drawingCtx.getPPIX(), opt.padding/*px*/);
			},

			_getContentWidth: function () {
				var t = this, opt = t.options;
				return t.right - t.left - asc_calcnpt(0, t.drawingCtx.getPPIX(), opt.padding + opt.padding + 1/*px*/);
			},

			_getContentHeight: function () {
				var t = this;
				return t.bottom - t.top;
			},

			_getContentPosition: function () {
				var t = this, opt = t.options, ppix = t.drawingCtx.getPPIX();

				switch (t.textFlags.textAlign) {
					case kRightAlign:
						return asc_calcnpt(t.right - t.left, ppix, -opt.padding - 1);
					case kCenterAlign:
						return asc_calcnpt(0.5 * (t.right - t.left), ppix, 0);
				}
				return asc_calcnpt(0, ppix, opt.padding);
			},

			_wrapFragments: function (frag) {
				var i, s, ret = false;
				for (i = 0; i < frag.length; ++i) {
					s = frag[i].text;
					if (s.indexOf("\u00B6") >= 0) {
						s = s.replace(/\u00B6/g, "\n");
						ret = true;
					}
					frag[i].text = s;
				}
				return ret;
			},

			_wrapText: function () {
				var t = this;
				t.textFlags.wrapOnlyNL = true;
				t._wrapFragments(t.options.fragments);
			},

			_addChars: function (str, pos, isRange) {
				var t = this, opt = t.options, f, l, s;

				if (t.selectionBegin !== t.selectionEnd) {t._removeChars(undefined, undefined, isRange);}

				if (pos === undefined) {pos = t.cursorPos;}

				if (!t.undoMode) {
					// save info to undo/redo
					t.undoList.push({fn: t._removeChars, args: [pos, str.length], isRange: isRange});
					t.redoList = [];
				}

				if (t.newTextFormat) {
					var oNewObj = new Fragment({format: t.newTextFormat, text: str});
					t._addFragments([oNewObj], pos);
					delete t.newTextFormat;
				} else {
					f = t._findFragmentToInsertInto(pos);
					if (f) {
						l = pos - f.begin;
						s = opt.fragments[f.index].text;
						opt.fragments[f.index].text = s.slice(0, l) + str + s.slice(l);
					}
				}

				t.cursorPos = pos + str.length;
				if (!t.undoAllMode) {
					t._update();
				}
			},

			_addNewLine: function () {
				this._wrapText();
				this._addChars(kNewLine);
			},

			_removeChars: function (pos, length, isRange) {
				var t = this, opt = t.options, b, e, l, first, last;

				if (t.selectionBegin !== t.selectionEnd) {
					b = Math.min(t.selectionBegin, t.selectionEnd);
					e = Math.max(t.selectionBegin, t.selectionEnd);
					t.selectionBegin = t.selectionEnd = -1;
					t._cleanSelection();
				} else if (length === undefined) {
					switch (pos) {
						case kPrevChar: b = t.textRender.getPrevChar(t.cursorPos); e = t.cursorPos; break;
						case kNextChar: b = t.cursorPos; e = t.textRender.getNextChar(t.cursorPos); break;
						case kPrevWord: b = t.textRender.getPrevWord(t.cursorPos); e = t.cursorPos; break;
						case kNextWord: b = t.cursorPos; e = t.textRender.getNextWord(t.cursorPos); break;
						default: return;
					}
				} else {
					b = pos;
					e = pos + length;
				}

				if (b === e) {return;}

				// search for begin and end positions
				first = t._findFragment(b);
				last = t._findFragment(e - 1);

				if (!t.undoMode) {
					// save info to undo/redo
					if (e - b < 2 && opt.fragments[first.index].text.length > 1) {
						t.undoList.push({fn: t._addChars, args: [t.textRender.getChars(b, 1), b], isRange: isRange});
					} else {
						t.undoList.push({fn: t._addFragments, args: [t._getFragments(b, e - b), b], isRange: isRange});
					}
					t.redoList = [];
				}

				if (first && last) {
					// remove chars
					if (first.index === last.index) {
						l = opt.fragments[first.index].text;
						opt.fragments[first.index].text = l.slice(0, b - first.begin) + l.slice(e - first.begin);
					} else {
						opt.fragments[first.index].text = opt.fragments[first.index].text.slice(0, b - first.begin);
						opt.fragments[last.index].text = opt.fragments[last.index].text.slice(e - last.begin);
						l = last.index - first.index;
						if (l > 1) {
							opt.fragments.splice(first.index + 1, l - 1);
						}
					}
					// merge fragments with equal formats
					t._mergeFragments();
				}

				t.cursorPos = b;
				if (!t.undoAllMode) {
					t._update();
				}
			},

			_selectChars: function (kind, pos) {
				var t = this;
				var begPos, endPos;

				begPos = t.selectionBegin === t.selectionEnd ? t.cursorPos : t.selectionBegin;
				t._moveCursor(kind, pos);
				endPos = t.cursorPos;

				t.selectionBegin = begPos;
				t.selectionEnd = endPos;
				t._drawSelection();
				if (t.isTopLineActive && !t.skipTLUpdate) {t._updateTopLineCurPos();}
			},

			_changeSelection: function (coord) {
				var t = this;

				function doChangeSelection(coord) {
					var pos = t._findCursorPosition(coord);
					if (pos !== undefined) {pos >= 0 ? t._selectChars(kPosition, pos) : t._selectChars(pos);}
					if (t.isSelectMode) {
						t.selectionTimer = window.setTimeout(
								function () {doChangeSelection(coord);},
								t.settings.selectionTimeout);
					}
				}

				window.clearTimeout(t.selectionTimer);
				t.selectionTimer = window.setTimeout(function () {doChangeSelection(coord);}, 0);
			},

			_findFragment: function (pos) {
				var opt = this.options, i, begin, end;

				for (i = 0, begin = 0; i < opt.fragments.length; ++i) {
					end = begin + opt.fragments[i].text.length;
					if (pos >= begin && pos < end) {
						return {index: i, begin: begin, end: end};
					}
					if (i < opt.fragments.length - 1) {
						begin = end;
					}
				}
				return pos === end ? {index: i-1, begin: begin, end: end} : undefined;
			},

			_findFragmentToInsertInto: function (pos) {
				var opt = this.options, i, begin, end;

				for (i = 0, begin = 0; i < opt.fragments.length; ++i) {
					end = begin + opt.fragments[i].text.length;
					if (pos >= begin && pos <= end) {
						return {index: i, begin: begin, end: end};
					}
					if (i < opt.fragments.length - 1) {
						begin = end;
					}
				}
				return undefined;
			},

			_isWholeFragment: function (pos, len) {
				var fr = this._findFragment(pos);
				return fr && pos === fr.begin && len === fr.end - fr.begin;
			},

			_splitFragment: function (f, pos) {
				var t = this, opt = t.options, fr;

				if (pos > f.begin && pos < f.end) {
					fr = opt.fragments[f.index];
					Array.prototype.splice.apply(
							opt.fragments,
							[f.index, 1].concat([
									new Fragment({format: fr.format.clone(), text: fr.text.slice(0, pos - f.begin)}),
									new Fragment({format: fr.format.clone(), text: fr.text.slice(pos - f.begin)})]));
				}
			},

			_getFragments: function (startPos, length) {
				var t = this, opt = t.options, endPos = startPos + length - 1, res = [], fr, i;
				var first = t._findFragment(startPos);
				var last = t._findFragment(endPos);

				if (!first || !last) {throw "Can not extract fragment of text";}

				if (first.index === last.index) {
					fr = opt.fragments[first.index].clone();
					fr.text = fr.text.slice(startPos - first.begin, endPos - first.begin + 1);
					res.push(fr);
				} else {
					fr = opt.fragments[first.index].clone();
					fr.text = fr.text.slice(startPos - first.begin);
					res.push(fr);
					for (i = first.index + 1; i < last.index; ++i) {
						fr = opt.fragments[i].clone();
						res.push(fr);
					}
					fr = opt.fragments[last.index].clone();
					fr.text = fr.text.slice(0, endPos - last.begin + 1);
					res.push(fr);
				}

				return res;
			},

			_extractFragments: function(startPos, length) {
				var t = this, fr;

				fr = t._findFragment(startPos);
				if (!fr) {throw "Can not extract fragment of text";}
				t._splitFragment(fr, startPos);

				fr = t._findFragment(startPos + length);
				if (!fr) {throw "Can not extract fragment of text";}
				t._splitFragment(fr, startPos + length);
			},

			_addFragments: function (f, pos) {
				var t = this, opt = t.options, fr;

				fr = t._findFragment(pos);
				if (fr && pos < fr.end) {
					t._splitFragment(fr, pos);
					fr = t._findFragment(pos);
					Array.prototype.splice.apply(opt.fragments, [fr.index, 0].concat(f));
				} else {
					opt.fragments = opt.fragments.concat(f);
				}

				// merge fragments with equal formats
				t._mergeFragments();

				t.cursorPos = pos + t._getFragmentsLength(f);
				if (!t.undoAllMode) {
					t._update();
				}
			},

			_mergeFragments: function () {
				var t = this, opt = t.options, i;

				for (i = 0; i < opt.fragments.length; ) {
					if (opt.fragments[i].text.length < 1 && opt.fragments.length > 1) {
						opt.fragments.splice(i, 1);
						continue;
					}
					if (i < opt.fragments.length - 1)
					{
						var fr = opt.fragments[i];
						var nextFr = opt.fragments[i + 1];
					    if(fr.format.isEqual(nextFr.format)) {
							opt.fragments.splice(i, 2, new Fragment({format: fr.format, text: fr.text + nextFr.text}));
							continue;
						}
					}
					++i;
				}
			},

			_cleanFragments: function (fr) {
				var t = this, i, s, f, wrap = t.textFlags.wrapText || t.textFlags.wrapOnlyNL;

				for (i = 0; i < fr.length; ++i) {
					s = fr[i].text;
					if (s.search(t.reNL) >= 0) {s = s.replace(t.reReplaceNL, wrap ? "\n" : "\u00B6");}
					if (s.search(t.reTab) >= 0) {s = s.replace(t.reReplaceTab, "        ");}
					fr[i].text = s;
					f = fr[i].format;
					if (f.fn === "") {f.fn = t.options.font.FontFamily.Name;}
					if (f.fs === 0) {f.fs = t.options.font.FontSize;}
				}
			},

			_getFragmentsLength: function (f) {
				return f.length > 0 ? f.reduce(function(pv, cv){return pv + cv.text.length;}, 0) : 0;
			},

			_getFragmentsText: function (f) {
				return f.length > 0 ? f.reduce(function(pv, cv){return pv + cv.text;}, "") : "";
			},

			_setFormatProperty: function (format, prop, val) {
				switch (prop) {
					case "fn": format.fn = val; break;
					case "fs": format.fs = val; break;
					case "b":
						val = (null === val) ? ((format.b) ? !format.b : true) : val;
						format.b = val;
						break;
					case "i":
						val = (null === val) ? ((format.i) ? !format.i : true) : val;
						format.i = val;
						break;
					case "u":
						val = (null === val) ? ((format.u) ? !format.u : true) : val;
						format.u = val;
						break;
					case "s":
						val = (null === val) ? ((format.s) ? !format.s : true) : val;
						format.s = val;
						break;
					case "fa": format.va = val; break;
					case "c":
						format.c = val;
						break;
					case "changeFontSize":
						var newFontSize = asc_incDecFonSize(val, format.fs);
						if (null !== newFontSize)
							format.fs = newFontSize;
						break;
				}
				return val;
			},

			_performAction: function (list1, list2) {
				var t = this, action, str, pos, len;

				if (list1.length < 1) {return;}

				action = list1.pop();

				if (action.fn === t._removeChars) {
					pos = action.args[0];
					len = action.args[1];
					if (len < 2 && !t._isWholeFragment(pos, len)) {
						list2.push({fn: t._addChars, args: [t.textRender.getChars(pos, len), pos], isRange: action.isRange});
					} else {
						list2.push({fn: t._addFragments, args: [t._getFragments(pos, len), pos], isRange: action.isRange});
					}
				} else if (action.fn === t._addChars) {
					str = action.args[0];
					pos = action.args[1];
					list2.push({fn: t._removeChars, args: [pos, str.length], isRange: action.isRange});
				} else if (action.fn === t._addFragments) {
					pos = action.args[1];
					len = t._getFragmentsLength(action.args[0]);
					list2.push({fn: t._removeChars, args: [pos, len], isRange: action.isRange});
				} else {
					return;
				}

				t.undoMode = true;
				action.fn.apply(t, action.args);
				t.undoMode = false;
			},

			_tryCloseEditor: function (event) {
				if (this.close(true))
					this.handlers.trigger("applyCloseEvent", event);
			},

			_getAutoComplete: function(str) {
				// ToDo можно ускорить делая поиск каждый раз не в большом массиве, а в уменбшенном (по предыдущим символам)
				var oLastResult = this.objAutoComplete[str];
				if (oLastResult)
					return oLastResult;

				var arrAutoComplete = this.options.autoComplete;
				var arrAutoCompleteLC = this.options.autoCompleteLC;
				var i, length, arrResult = [];
				for (i = 0, length = arrAutoCompleteLC.length; i < length; ++i) {
					if (0 === arrAutoCompleteLC[i].indexOf(str))
						arrResult.push(arrAutoComplete[i]);
				}
				return this.objAutoComplete[str] = arrResult;
			},

			_getFormulaList: function(str) {
				var _this = this;
				var text = _this.input.value + str;
				if ( text.indexOf("=") == 0 ) {
					var pattern = text.substring(1);
					var api = asc["editor"];
					if ( api.wb && pattern.length ) {
						var ws = api.wb.getWorksheet();
						if ( ws ) {
							var oFormulaList = {};
							var editedCol = ws.getSelectedColumnIndex();
							var editedRow = ws.getSelectedRowIndex() + 1;
							var fvr = ws.getFirstVisibleRow();
							var fvc = ws.getFirstVisibleCol();
							
							oFormulaList.col = editedCol;
							oFormulaList.row = editedRow;
							oFormulaList.y = ws.getCellTop(editedRow, 0) - (fvr ? ws.getCellTop(fvr, 0) - ws.getCellTop(0, 0) : 0);
							oFormulaList.x = ws.getCellLeft(editedCol, 0) - (fvc ? ws.getCellLeft(fvc, 0) - ws.getCellLeft(0, 0) : 0);
							oFormulaList.list = [];
							
							var fullFormulaList = api.asc_getFormulasInfo();
							for ( var i = 0; i < fullFormulaList.length; i++ ) {
								var group = fullFormulaList[i];
								for ( var j = 0; j < group.formulasArray.length; j++ ) {
									if ( group.formulasArray[j].name.indexOf(pattern/*.toUpperCase()*/) == 0 ) {
										oFormulaList.list.push(group.formulasArray[j]);
									}
								}
							}
							return oFormulaList.list.length ? oFormulaList : null;
						}
					}
				}
				return null;
			},
			
			_showFormulaSelector: function(formulaList) {
				if ( formulaList ) {
					var _this = this;
					var api = asc["editor"];
					var ws = api.wb.getWorksheet();	
					var canvasWidget = $("#" + api.HtmlElementName);
					
					var selector = document.createElement("div");
					selector.id = "formulaSelector";
					selector.style["zIndex"] = "3000";
					selector.style["width"] = "100px";
					selector.style["height"] = "auto";
					selector.style["backgroundColor"] = "#FFFFFF";
					selector.style["border"] = "1px solid Grey";
					selector.style["top"] = (formulaList.y + canvasWidget.offset().top) + "px";
					selector.style["left"] = (formulaList.x + canvasWidget.offset().left) + "px";
					selector.style["position"] = "absolute";
					selector.style["cursor"] = "default";
					selector.style["font-size"] = "12px";
					selector.style["padding"] = "4px";
					selector.style["fontSize"] = "12px";
					document.body.appendChild(selector);
					
					// Selection hack
					var clearSelection = function() {
						if (document.selection && document.selection.empty) {
							document.selection.empty();
						}
						else if (window.getSelection) {
							var sel = window.getSelection();
							sel.removeAllRanges();
						}
					}
					
					// TODO: В Mozilla избавиться от селекта текста при dblclick
					
					var combo = document.createElement("ul");
					combo.id = "formulaList";
					combo.style["margin"] = 0;
					combo.style["padding"] = 0;
					combo.style["listStyle"] = "none";
					combo.style["listImage"] = "none";
					selector.appendChild(combo);
					
					for ( var i = 0; i < formulaList.list.length; i++ ) {
						var item = document.createElement("li");
						if ( item.textContent != undefined )
							item.textContent = formulaList.list[i].name;
						else
							item.innerText = formulaList.list[i].name;
						item.setAttribute("title", formulaList.list[i].arg);
						
						item.onmouseover = function(e) {
							var nodes = combo.childNodes;
							for ( var i = 0; i < nodes.length; i++ ) {
								if ( nodes[i].style["backgroundColor"] != "" ) {
									nodes[i].style["backgroundColor"] = "";
								}
							}
							this.style["backgroundColor"] = _this.formulaSelectorColor;
						}
						item.onmouseout = function(e) {
							this.style["backgroundColor"] = "";
						}
						item.ondblclick = function(e) {
							if ( e && (e.button === 0) ) {
								var formulaName = this.innerText || this.textContent;
								var insertText = formulaName.substring(_this.input.value.length - 1) + "(";
								_this._addChars(insertText);
								_this._removeFormulaSelector();
							}
						}
						combo.appendChild(item);
					}
					// Calculate scroll
					var lvr = ws.getLastVisibleRow();
					var lvc = ws.getLastVisibleCol();
					var getBottomPoint = function() {
						var pointPx = formulaList.y + selector.offsetHeight;
						return pointPx * asc.getCvtRatio( 0, 1, ws.drawingCtx.getPPIY() );
					}
					var getRightPoint = function() {
						var pointPx = formulaList.x + selector.offsetWidth;
						return pointPx * asc.getCvtRatio( 0, 1, ws.drawingCtx.getPPIX() );
					}
					// Height
					var row = ws._findRowUnderCursor(getBottomPoint(), true);
					while ( !row ) {
						ws.expandRowsOnScroll(true);
						row = ws._findRowUnderCursor(getBottomPoint(), true);
					}
					if ( row.row - lvr > 0 ) {
						ws.scrollVertical(row.row - lvr + 1, _this);
						//ws.handlers.trigger("reinitializeScrollY");
					}
					// Width
					var col = ws._findColUnderCursor(getRightPoint(), true);
					while ( !col ) {
						ws.expandColsOnScroll(true);
						col = ws._findColUnderCursor(getRightPoint(), true);
					}
					if ( col.col - lvc > 0 ) {
						ws.scrollHorizontal(col.col - lvc + 1, _this);
						//ws.handlers.trigger("reinitializeScrollX");
					}
				}
			},
			
			_removeFormulaSelector: function() {
				var selector = document.getElementById("formulaSelector");
				if ( selector )
					selector.parentNode.removeChild(selector);
			},
			
			_updateFormulaSelectorPosition: function() {
				var selector = document.getElementById("formulaSelector");
				if ( selector ) {
					var api = asc["editor"];
					if ( api.wb ) {
						var ws = api.wb.getWorksheet();
						if ( ws ) {
							var editedCol = ws.getSelectedColumnIndex();
							var editedRow = ws.getSelectedRowIndex() + 1;
							
							for (var n = 0; n < ws.drawingArea.frozenPlaces.length; n++) {
								var frozenPlace = ws.drawingArea.frozenPlaces[n];
								if ( !frozenPlace.isCellInside({ col: editedCol, row: editedRow }) )
									continue;
									
								var fv = frozenPlace.getFirstVisible();
								if ( (editedCol < fv.col) || (editedRow < fv.row) ) {
									selector.style["display"] = "none";
									return;
								}
								else
									selector.style["display"] = "";
								
								var y = ws.getCellTop(editedRow, 0) + frozenPlace.getVerticalScroll() - ws.getCellTop(0, 0);
								var x = ws.getCellLeft(editedCol, 0) + frozenPlace.getHorizontalScroll() - ws.getCellLeft(0, 0);
								
								var canvasWidget = $("#" + api.HtmlElementName);
								if ( canvasWidget ) {
									selector.style["top"] = (y + canvasWidget.offset().top) + "px";
									selector.style["left"] = (x + canvasWidget.offset().left) + "px";
								}
								return;
							}
						}
					}
				}
			},
			
			_keyDownFormulaSelector: function (event) {
				var _this = this;
				var combo = document.getElementById("formulaList");
				if ( combo ) {
					var nodes = combo.childNodes;
					
					switch (event.which) {
						case 38: // Up
							{
								var selectedIndex = nodes.length;
								for ( var i = 0; i < nodes.length; i++ ) {
									if ( nodes[i].style["backgroundColor"] != "" ) {
										selectedIndex = i;
										nodes[i].style["backgroundColor"] = "";
										break;
									}
								}
								selectedIndex--;
								if ( selectedIndex < 0 )
									selectedIndex = 0;
								nodes[selectedIndex].style["backgroundColor"] = _this.formulaSelectorColor;							
							}
							break;
						case 40: // Down
							{
								var selectedIndex = -1;
								for ( var i = 0; i < nodes.length; i++ ) {
									if ( nodes[i].style["backgroundColor"] != "" ) {
										selectedIndex = i;
										nodes[i].style["backgroundColor"] = "";
										break;
									}
								}
								selectedIndex++;
								if ( selectedIndex >= nodes.length )
									selectedIndex = nodes.length - 1;
								nodes[selectedIndex].style["backgroundColor"] = _this.formulaSelectorColor;							
							}
							break;
						case 9: // Tab
							{
								for ( var i = 0; i < nodes.length; i++ ) {
									if ( nodes[i].style["backgroundColor"] != "" ) {
										var formulaName = nodes[i].innerText || nodes[i].textContent;
										var insertText = formulaName.substring(_this.input.value.length - 1) + "(";
										_this._addChars(insertText);
										_this._removeFormulaSelector();
										break;
									}
								}
							}
							break;
					}
				}
			},
			
			// Event handlers

			/** @param event {jQuery.Event} */
			_onWindowKeyDown: function (event) {
				var t = this, kind = undefined, hieroglyph = false;

				if (!t.isOpened || !t.enableKeyEvents) {return true;}

				// для исправления Bug 15902 - Alt забирает фокус из приложения
				if (event.which === 18) {
					t.lastKeyCode = event.which;
				}

				t.skipKeyPress = true;
				t.skipTLUpdate = false;

				// определение ввода иероглифов
				if (t.isTopLineActive && t._getFragmentsLength(t.options.fragments) !== t.input.value.length) {
					hieroglyph = true;
				}

				switch (event.which) {

					case 27:  // "esc"
						if (t.handlers.trigger("isGlobalLockEditCell"))
							return false;
						t.undoAll();
						t.close();
						t._removeFormulaSelector();
						return false;

					case 13:  // "enter"
						if (!t.hasFocus) {t.setFocus(true);}
						if (!(event.altKey && event.shiftKey)) {
							if (event.altKey)
								t._addNewLine();
							else {
								if (false === t.handlers.trigger("isGlobalLockEditCell"))
									t._tryCloseEditor(event);
							}
						}
						return false;

					case 9: // tab
						if (!t.hasFocus) {t.setFocus(true);}
						if (hieroglyph) {t._syncEditors();}

						if (false === t.handlers.trigger("isGlobalLockEditCell"))
							t._tryCloseEditor(event);
						return false;

					case 8:   // "backspace"
						if (hieroglyph) {t._syncEditors();}
						t._removeChars(event.ctrlKey ? kPrevWord : kPrevChar);
						return false;

					case 46:  // "del"
						if (!t.hasFocus) {t.setFocus(true);}
						if (hieroglyph) {t._syncEditors();}
						t.skipTLUpdate = true;
						t._removeChars(event.ctrlKey ? kNextWord : kNextChar);
						return true;

					case 37:  // "left"
						if (!t.hasFocus) {break;}
						if (hieroglyph) {t._syncEditors();}
						kind = event.ctrlKey ? kPrevWord : kPrevChar;
						event.shiftKey ? t._selectChars(kind) : t._moveCursor(kind);
						return false;

					case 39:  // "right"
						if (!t.hasFocus) {break;}
						if (hieroglyph) {t._syncEditors();}
						kind = event.ctrlKey ? kNextWord : kNextChar;
						event.shiftKey ? t._selectChars(kind) : t._moveCursor(kind);
						return false;

					case 38:  // "up"
						if (!t.hasFocus) {break;}
						if (hieroglyph) {t._syncEditors();}
						event.shiftKey ? t._selectChars(kPrevLine) : t._moveCursor(kPrevLine);
						return false;

					case 40:  // "down"
						if (!t.hasFocus) {break;}
						if (hieroglyph) {t._syncEditors();}
						event.shiftKey ? t._selectChars(kNextLine) : t._moveCursor(kNextLine);
						return false;

					case 35:  // "end"
						if (!t.hasFocus) {break;}
						if (hieroglyph) {t._syncEditors();}
						kind = event.ctrlKey ? kEndOfText : kEndOfLine;
						event.shiftKey ? t._selectChars(kind) : t._moveCursor(kind);
						return false;

					case 36:  // "home"
						if (!t.hasFocus) {break;}
						if (hieroglyph) {t._syncEditors();}
						kind = event.ctrlKey ? kBeginOfText : kBeginOfLine;
						event.shiftKey ? t._selectChars(kind) : t._moveCursor(kind);
						return false;

					case 53: // 5
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							// Отключим стандартную обработку браузера нажатия ctlr + 5
							event.stopPropagation();
							event.preventDefault();
							if (hieroglyph) {t._syncEditors();}
							t.setTextStyle("s", null);
							return true;
						}
						break;

					case 65: // A
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							// Отключим стандартную обработку браузера нажатия ctlr + a
							if (!t.isTopLineActive) {
								event.stopPropagation();
								event.preventDefault();
							}
							t._moveCursor(kBeginOfText);
							t._selectChars(kEndOfText);
							return true;
						}
						break;

					case 66: // B
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							// Отключим стандартную обработку браузера нажатия ctlr + b
							event.stopPropagation();
							event.preventDefault();
							if (hieroglyph) {t._syncEditors();}
							t.setTextStyle("b", null);
							return true;
						}
						break;

					case 73: // I
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							// Отключим стандартную обработку браузера нажатия ctlr + i
							event.stopPropagation();
							event.preventDefault();
							if (hieroglyph) {t._syncEditors();}
							t.setTextStyle("i", null);
							return true;
						}
						break;

					/*case 83: // S
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							if (hieroglyph) {t._syncEditors();}

							if (false === t.handlers.trigger("isGlobalLockEditCell"))
					 			t._tryCloseEditor(event);
							return false;
						}
						break;*/

					case 85: // U
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							// Отключим стандартную обработку браузера нажатия ctlr + u
							event.stopPropagation();
							event.preventDefault();
							if (hieroglyph) {t._syncEditors();}
							t.setTextStyle("u", null);
							return true;
						}
						break;

					case 144://Num Lock
					case 145://Scroll Lock
						if (AscBrowser.isOpera) {
							event.stopPropagation();
							event.preventDefault();
						}
						return false;

					case 80: // print           Ctrl + p
						if (event.ctrlKey) {
							event.stopPropagation();
							event.preventDefault();
							return false;
						}
						break;

					case 67: // copy  Ctrl + c
					case 86: // paste Ctrl + v
					case 88: // redo  Ctrl + x
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							// возвращение фокуса в top line
							if (t.isTopLineActive) {
								// чтобы поставить выполнение в очередь после вставки из клипборда используется двойной setTimeout
								setTimeout(
										function(){setTimeout(function(){t._updateTopLineCurPos(); t.input.focus();}, 0);},
										0);
							}
							switch (event.which) {
								case 67: t.handlers.trigger("copy");break;
								case 86: t.handlers.trigger("paste");break;
								case 88: t.handlers.trigger("cut");break;
							}
							return true;
						}
						break;

					case 89:  // ctrl + y
					case 90:  // ctrl + z
						if (event.ctrlKey) {
							if (!t.hasFocus) {t.setFocus(true);}
							event.which === 90 ? t.undo() : t.redo();
							return false;
						}
						break;

					case 113: // F2
						if (AscBrowser.isOpera) {
							event.stopPropagation();
							event.preventDefault();
						}
						return false;

				}

				t.skipKeyPress = false;
				t.skipTLUpdate = true;
				return true;
			},

			/** @param event {jQuery.Event} */
			_onWindowKeyPress: function (event) {
				var t = this;

				if (!t.isOpened || !t.enableKeyEvents) {return true;}

				if (t.skipKeyPress || event.which < 32 || event.altKey || event.ctrlKey) {
					t.skipKeyPress = true;
					return true;
				}

				// Проверим, есть ли глобальный lock
				//if (t.handlers.trigger("isGlobalLockEditCell"))
				//	return true;

				if (!t.hasFocus) {t.setFocus(true);}

				// определение ввода иероглифов
				if (t.isTopLineActive && t._getFragmentsLength(t.options.fragments) !== t.input.value.length) {
					t._syncEditors();
				}

				//t.setFocus(true);
				t.isUpdateValue = false;

				t._addChars(String.fromCharCode(event.which));
				if (t.textRender.getEndOfText() === t.cursorPos && !t.isFormula()) {
					var s = t._getFragmentsText(t.options.fragments);
					if (!isNumber(s)) {
						var arrAutoComplete = t._getAutoComplete(s.toLowerCase());
						var lengthInput = s.length;
						if (1 === arrAutoComplete.length) {
							var newValue = arrAutoComplete[0];
							var tmpCursorPos = t.cursorPos;
							t._addChars(newValue.substring(lengthInput));
							t.selectionBegin = tmpCursorPos;
							t._selectChars(kEndOfText);
						}
					}
				}

				//t._removeFormulaSelector();
				//var oFormulaList = t._getFormulaList(oNewChar);
				
				//if (oFormulaList) {
				//	t._showFormulaSelector(oFormulaList);
				//}
				/*if ( oAutoString ) {
					t._addChars(oAutoString.text);
					t.selectionBegin = oAutoString.selectionBegin;
					t.selectionEnd = oAutoString.selectionEnd;
					t._drawSelection();
				}
				else
					t._addChars(String.fromCharCode(event.which));*/
					
				return t.isTopLineActive ? true : false; // prevent event bubbling
			},

			/** @param event {jQuery.Event} */
			_onWindowKeyUp: function (event) {
				var t = this;

				// для исправления Bug 15902 - Alt забирает фокус из приложения
				if (t.lastKeyCode === 18 && event.which === 18) {
					return false;
				}
			},

			/** @param event {jQuery.Event} */
			_onWindowMouseUp: function (event) {
				this.isSelectMode = false;
				if (this.callTopLineMouseup) {this._topLineMouseUp();}
				return true;
			},

			/** @param event {jQuery.Event} */
			_onWindowMouseMove: function (event) {
				if (this.isSelectMode && !this.hasCursor) {this._changeSelection(this._getCoordinates(event));}
				return true;
			},

			/** @param event {jQuery.Event} */
			_onMouseDown: function (event) {
				var t = this;
				var coord = t._getCoordinates(event);
				var pos;

				this.setFocus(true);

				t.isTopLineActive = false;
				t.input.isFocused = false;
				t._showCursor();

				if (event.which === 1) {
					if (!event.shiftKey) {
						t.isSelectMode = true;
						pos = t._findCursorPosition(coord);
						if (pos !== undefined) {pos >= 0 ? t._moveCursor(kPosition, pos) : t._moveCursor(pos);}
					} else {
						t._changeSelection(coord);
					}
				}
				return true;
			},

			/** @param event {jQuery.Event} */
			_onMouseUp: function (event) {
				this.isSelectMode = false;
				return true;
			},

			/** @param event {jQuery.Event} */
			_onMouseMove: function (event) {
				this.hasCursor = true;
				if (this.isSelectMode) {
					this._changeSelection(this._getCoordinates(event));
				}
				return true;
			},

			/** @param event {jQuery.Event} */
			_onMouseLeave: function (event) {
				this.hasCursor = false;
				return true;
			},

			/** @param event {jQuery.Event} */
			_onMouseDblClick: function (event) {
				var t = this;
				// Окончание слова
				var endWord = t.textRender.getNextWord(t.cursorPos);
				if (endWord === t.cursorPos){
					// Мы в последнем слове
					endWord = t.textRender.getEndOfLine(t.cursorPos);
				}
				// Начало слова (ищем по окончанию, т.к. могли попасть в пробел)
				var startWord = t.textRender.getPrevWord(endWord);

				t._moveCursor(kPosition, startWord);
				t._selectChars(kPosition, endWord);
				return true;
			},

			/** @param event {jQuery.Event} */
			_onInputTextArea: function (event) {
				if (this.handlers.trigger("isViewerMode"))
					return true;

				if (this.isUpdateValue) {
					// Для языков с иероглифами не приходят эвенты с клавиатуры, поэтому обработаем здесь
					this.skipTLUpdate = true;
					this.replaceText(0, this.textRender.getEndOfLine(this.cursorPos), this.input.value);
				}
				this.isUpdateValue = true;
				return true;
			},

			/** @param event {jQuery.Event} */
			_getCoordinates: function (event) {
				var t = this;
				var offs = $(t.canvasOverlay).offset();
				var x = (event.pageX - offs.left) / t.kx;
				var y = (event.pageY - offs.top) / t.ky;
				return {x: x, y: y};
			}

		};


		/*
		 * Export
		 * -----------------------------------------------------------------------------
		 */
		window["Asc"].CellEditor = CellEditor;


	}
)(jQuery, window);
