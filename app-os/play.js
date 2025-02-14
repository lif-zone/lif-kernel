import 'https://unpkg.com/@babel/standalone@7.26.4/babel.js';
let Babel = window.Babel;
import React from "https://esm.sh/react@19/?dev";
import ReactDOMClient from "https://esm.sh/react-dom@19/client?dev";
import {EditorView, basicSetup} from "https://esm.sh/codemirror"
let CodeMirror = window.CodeMirror;
//import CodeMirror from "https://esm.sh/codemirror"
let parser = Babel.packages.parser;
let traverse = Babel.packages.traverse.default;
var editor = document.querySelector('.editor');
let cm = CodeMirror(editor, {lineNumbers: true, mode: 'javascript'});
cm.g = ()=>cm.getValue();
cm.s = v=>cm.setValue(v);
cm.g('42');

let p, src, exports, requires, imports;
let get_scope_type = path=>{
  console.log('path', path);
  for (; path; path=path.parentPath){
    if (path.type=='TryStatement'){
      console.log('try', path.type);
      return 'try';
      }
    let b = path.scope.block;
    if (b.type=='FunctionExpression' ||
      b.type=='ArrowFunctionExpression' ||
      b.type=='FunctionDeclaration')
    {
      return b.async ? 'async' : 'sync';
    }
    if (b.type=='CatchClause'){
      console.log('catch', b.type);
      return 'catch';
    }
    if (b.type=='Program')
      return 'program';
  }
};
function do_parse(s){
  console.log("do_parse");
  src = s;
  cm.s(s);
  exports = [];
  requires = [];
  imports = [];
  p = parser.parse(s, {sourceType: 'module', plugins: ['jsx', 'typescript']});
  console.log(p);
  traverse(p, {
    AssignmentExpression: function(path){
      let n = path.node, l = n.left, r = n.right, v;
      if (n.operator=='=' &&
        l.type=='MemberExpression' &&
        l.object.name=='exports' && l.object.type=='Identifier' &&
        l.property.type=='Identifier')
      {
        exports.push(v=l.property.name);
        let type = get_scope_type(path);
        //console.log(l.property.name);
        console.log('found export('+v+'): '+s.slice(n.start, n.end), type, /*path*/);
      }
    },
    CallExpression: function(path){
      let n = path.node, v;
      if (n.callee.type=='Identifier' && n.callee.name=='require' &&
        n.arguments.length==1 && n.arguments[0].type=='StringLiteral')
      {
        requires.push(v = n.arguments[0].value);
        let type = get_scope_type(path);
        console.log('found require('+v+'): '+s.slice(n.start, n.end), type, /*path*/);
      }
    },
    ImportDeclaration: function(path){
      let n = path.node, v;
      if (n.source.type=='StringLiteral'){
        imports.push(v = n.source.value);
        console.log('found import('+v+')');
      }
    },
  });
  console.error("AST", p);
}
async function load(){
  let url;
  //url = 'https://unpkg.com/react@18/umd/react.development.js';
  //url = 'https://unpkg.com/react-dom@19.0.0/cjs/react-dom.development.js';
  //url = 'https://unpkg.com/react-dom@19.0.0/index.js';
  //url = 'https://unpkg.com/inherits@2.0.4/inherits.js';
  //url = 'https://esm.sh/react-dom@19/client?dev'; // import
  //url = 'http://localhost:3000/lif.app/public/basic_main.tsx';
  url = 'https://cdn.jsdelivr.net/npm/stylis@4.3.2/index.js';
  let res = await fetch(url);
  let src = await res.text();
  do_parse(src);
}

await load();
function Scroll(s){
  if (!(this instanceof Scroll))
    return new Scroll(...arguments);
  this.s = s;
  this.diff = [];
  this.len = this.s.length;
}
Scroll.prototype.get_diff_pos = function(at, len){
  if (at+len>this.len)
    throw Error('diff out of s range');
  let i, d;
  // use binary-search in the future
  for (i=0; d=this.diff[i]; i++){
    if (at>=d.at+d.len)
      continue;
    if (at+len<=d.at)
      return i;
    throw Error('diff overlaping');
  }
  return i;
};
Scroll.prototype.splice = function(at, len, s){
  // find the frag pos of src in dst, and update
  let i = this.get_diff_pos(at, len);
  this.diff.splice(i, 0, {at, len, s});
};
Scroll.prototype.out = function(){
  let s = '', at = 0, d;
  for (let i=0; d=this.diff[i]; i++){
    s += this.s.slice(at, d.at)+d.s;
    at = d.at+d.len;
  }
  s += this.s.slice(at, this.len);
  return s;
};

let assert_eq = (exp, res)=>{
  if (exp==res)
    return;
  console.error('test FAIL: exp', exp, 'res', res);
  throw Error('test FAIL');
}
function test_Scroll(){
  let t = v=>assert_eq(v, s.out());
  let s = Scroll('0123456789abcdef');
  s.splice(3, 2, 'ABCD');
  t('012ABCD56789abcdef');
  s.splice(6, 1, 'QW');
  t('012ABCD5QW789abcdef');
  s.splice(7, 1, '  ');
  t('012ABCD5QW  89abcdef');
  s.splice(6, 0, '-');
  s.splice(7, 0, '-');
  s.splice(8, 0, '-');
  t('012ABCD5-QW-  -89abcdef');
}
const btn = document.querySelector("button");
btn.addEventListener("click", ()=>{
  do_parse(cm.g());
  test_Scroll();
});


