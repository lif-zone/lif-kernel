// LICENSE_CODE JPL lpm.js
let ast_version = '2026.9.4';
export const version = ast_version;
let D = 0; // Debug
const {assert_obj} = await import('./util.js');
const Babel = await globalThis.import_npm('@babel/standalone@7.29.1/babel.js');
let parser = Babel.packages.parser;
let traverse = Babel.packages.traverse.default;

// https://webpack.js.org/plugins/define-plugin/
function ast_is_static(path){
  let node = path.node;
  let t = Babel.packages.types;
  if (t.isLiteral(node))
    return true;
  // Identifier: only "process" is allowed (checked later in MemberExpression)
  if (t.isIdentifier(node))
    return node.name==='process' && !path.scope.getBinding('process');
  // Unary !expr
  if (t.isUnaryExpression(node, { operator: '!' }))
    return ast_is_static(path.get('argument'));
  // Binary/Logical: === !== == != && ||
  if (t.isBinaryExpression(node) || t.isLogicalExpression(node)){
    let allowed = t.isBinaryExpression(node)
      ? ['===', '!==', '==', '!=', '&&', '||']
      : ['&&', '||'];
    if (!allowed.includes(node.operator))
      return false;
    return ast_is_static(path.get('left')) &&
      ast_is_static(path.get('right'));
  }
  // MemberExpression: process.env.X or process.env['X']
  if (t.isMemberExpression(node)){
    let obj = path.get('object'), _obj, prop;
    if (obj.isMemberExpression() &&
      (prop = obj.get('property')) &&
      prop.isIdentifier({name: 'env'}) &&
      (_obj = obj.get('object')) &&
      _obj.isIdentifier({name: 'process'}) &&
      (prop = path.get('property')) &&
      (prop.isIdentifier() || prop.isStringLiteral())
    ){
      let binding = path.scope.getBinding('process');
      return binding===undefined; // ← no binding = global process
    }
  }
  return false;
}

function ast_get_if_cond(path){
  let has_if = 0, cond, child, p = path;
  for (child=p; p; child=p, p=p.parentPath){
    let n = p.node;
    if (p.type=='IfStatement'){
      let nc = child.node;
      has_if++;
      let _static;
      traverse(n.test, {enter(p){
        _static = ast_is_static(p);
        p.stop();
      }}, p.scope);
      cond = {else: n.consequent!=nc, static: _static,
        start: n.test.start, end: n.test.end};
    }
  }
  if (has_if>1)
    return 'var';
  if (has_if==1)
    return cond;
}
function ast_get_scope_type(path, opt={}){
  let p;
  for (p=path; p; p=p.parentPath){
    if (opt.try && p.type=='TryStatement')
      return {type: 'try'};
    let b = p.scope.block;
    if (b.type=='FunctionExpression' ||
      b.type=='ArrowFunctionExpression' ||
      b.type=='FunctionDeclaration' ||
      b.type=='ClassMethod')
    {
      return {type: b.async ? 'async' : 'sync'};
    }
    if (opt.try && b.type=='CatchClause')
      return {type: 'catch'};
    if (b.type=='Program'){
      if (opt.if)
        return {type: 'program', cond: ast_get_if_cond(path)};
      return {type: 'program'};
    }
  }
}

let array_unique = a=>[...new Set(a)];

export function tr_tsx_to_js({tsx, type}){
  let js;
  let is_ts = type=='ts' || type=='tsx';
  let is_jsx = type=='jsx' || type=='tsx';
  // preserveFormat (and tokens createParenthesizedExpressions) do not yet
  // work with current babel: it alters spacing and indentation
  let opt = {presets: [], plugins: [],
    parserOpts: {tokens: true, createParenthesizedExpressions: true},
    generatorOpts: {importAttributesKeyword: 'with', retainLines: true,
      preserveFormat: true}};
  // XXX together with react, it strips unused module imports.
  // {modules: false} did not solve it.
  if (is_ts){
    opt.presets.push(['typescript', {modules: false}]);
    opt.filename = 'tr.'+type; // XXX was path_file(lmod)
  }
  if (is_jsx)
    opt.presets.push(['react', {modules: false, useSpread: true}]);
  try {
    ({code: js} = Babel.transform(tsx, opt));
  } catch(err){
    console.error('babel FAILED', err);
    return {err: 'tsx tr: '+err};
  }
  return js;
}

function tr_js_to_ast(js){
  let ast = {};
  let parse_ast = ()=>{
    let opt = ast.opt = {presets: [], plugins: []};
    opt.sourceType = 'module';
    try {
      ast.ast = parser.parse(js, opt);
    } catch(err){
      ast.err = 'ast: '+err;
      ast.type = 'err';
      ast._err = err;
    }
  };

  let scan_ast = ()=>{
    ast.exports = [];
    ast.requires = [];
    ast.imports = [];
    ast.imports_dyn = [];
    ast.exports_require = [];
    let has = ast.has = {};
    function _handle_import_source(path){
      let n = path.node;
      let s = n.source;
      if (s.type!='StringLiteral')
        return;
      let v = s.value;
      let {type} = ast_get_scope_type(path, {try: 1});
      let imported = [];
      n.specifiers?.forEach(spec=>{
        if (spec.type=='ImportSpecifier')
          imported.push(spec.imported.name);
        if (spec.type=='ImportNamespaceSpecifier'){
          let bind = path.scope.getBinding(spec.local.name);
          bind.referencePaths.forEach(ref=>{
            let cont = ref.container;
            if (cont.type=='MemberExpression' && !cont.computed)
              imported.push(cont.property.name);
          });
        }
      });
      imported = array_unique(imported).sort();
      ast.imports.push({module: v, start: s.start, end: s.end, type,
        imported: imported.length ? imported : null});
    }
    function _handle_export_source(path){
      let n = path.node;
      let s = n.source;
      if (s.type!='StringLiteral')
        return;
      let v = s.value;
      let {type} = ast_get_scope_type(path, {try: 1});
      let imported = [];
      n.specifiers?.forEach(spec=>{
        if (spec.type=='ExportSpecifier')
          imported.push(spec.exported.name);
        if (spec.type=='ExportNamespaceSpecifier'){
          // bind is null: bind = path.scope.getBinding(spec.exported.name);
          // there is a bug in babeljs that it does not bind named re-exports
          // so need to manually find the uses of these identifiers
          // and make sure they are not shadowed
          let name = spec.exported.name;
          path.scope.getProgramParent().path.traverse({
            Identifier(refPath){
              if (refPath.node.name!==name)
                return;
              if (!refPath.isReferencedIdentifier())
                return;
              if (refPath.scope.getBinding(name))
                return; // shadowed
              if (refPath.parentPath.isExportNamespaceSpecifier())
                return;
              let cont = refPath.container;
              if (cont.type=='MemberExpression' && !cont.computed)
                imported.push(cont.property.name);
            },
          });
        }
      });
      imported = array_unique(imported).sort();
      ast.imports.push({module: v, start: s.start, end: s.end, type,
        imported: imported.length ? imported : null});
    }
    function handle_import_source(path){
      has.import = true;
      _handle_import_source(path);
    }
    function handle_export_source(path){
      has.export = true;
      if (path.node.source)
        _handle_export_source(path);
    }
    function keep_comment(path){
      let comment = path.node.leadingComments?.[0];
      if (comment && comment.type=='CommentBlock' &&
        comment.value.trim()=='keep')
      {
        return true;
      }
    }

    traverse(ast.ast, {
      AssignmentExpression: path=>{
        let n = path.node, l = n.left, r = n.right;
        // AMD detection code: 'module' / 'exports' used from global scope:
        // if (typeof exports === 'object' && typeof module === 'object')
        //   module.exports = WDOSBOX;
        // else if (typeof define === 'function' && define.amd)
        //   define([], function() { return WDOSBOX; });
        // else if (typeof exports === 'object')
        //   exports["WDOSBOX"] = WDOSBOX;
        if (n.operator=='=' &&
          l.type=='MemberExpression' &&
          l.object.name=='exports' && l.object.type=='Identifier' &&
          l.property.type=='Identifier')
        {
          ast.exports.push(l.property.name);
          has.exports = true;
        }
        if (n.operator=='=' &&
          l.type=='MemberExpression' &&
          l.object.name=='module' && l.object.type=='Identifier' &&
          l.property.name=='exports' && l.property.type=='Identifier')
        {
          has.module = true;
          if (r.type=='CallExpression' &&
            r.callee.type=='Identifier' && r.callee.name=='require' &&
            r.arguments.length==1 && r.arguments[0].type=='StringLiteral')
          {
            ast.exports_require.push(r.arguments[0].value);
          } else if (r.type=='ObjectExpression' && r.properties){
            for (let i=0; i<r.properties.length; i++)
              ast.exports.push(r.properties[i].key.name);
          }
        }
      },
      CallExpression: path=>{
        let n = path.node, v;
        if (n.callee.type=='Identifier' && n.callee.name=='require' &&
          n.arguments.length==1 && n.arguments[0].type=='StringLiteral' &&
          !path.scope.getBinding('require'))
        {
          v = n.arguments[0].value;
          let {type, cond} = ast_get_scope_type(path, {try: 1, if: 1});
          ast.requires.push({module: v, start: n.start, end: n.end, type,
            cond});
          has.require = true;
        }
        if (n.callee.type=='Import' && !keep_comment(path))
          ast.imports_dyn.push({start: n.callee.start, end: n.callee.end});
        // AMD detection code: 'define' used and called from global scope:
        // else if (typeof define === 'function' && define.amd)
        //   define([], function() { return WDOSBOX; });
        // current code detects: define() calls.
        // TODO: also detect typedef define
        if (n.callee.type=='Identifier' && n.callee.name=='define' &&
          !path.scope.getBinding('define'))
        {
          has.define = true;
        }
      },
      ImportDeclaration: path=>handle_import_source(path),
      ExportNamedDeclaration: path=>{
        handle_export_source(path);
        path.node.specifiers.forEach(spec=>{
          if (spec.type=='ExportSpecifier' && spec.exported.name=='default')
            has.export_default = true;
        });
      },
      ExportDefaultDeclaration: path=>{
        handle_export_source(path);
        has.export_default = true;
      },
      ExportAllDeclaration: path=>handle_export_source(path),
      AwaitExpression: path=>{
        let {type} = ast_get_scope_type(path);
        if (type=='program')
          has.await = true;
      },
    });
    ast.type = has.import||has.export||has.await ? 'mjs' :
      has.define ? 'amd' :
      has.require||has.module||has.exports ? 'cjs' : '';
    ast.exports = array_unique(ast.exports).sort();
  };
  parse_ast();
  if (ast.err)
    return ast;
  scan_ast();
  return ast;
}

export function tr_js_to_meta(js){
  let ast = tr_js_to_ast(js);
  if (ast.err)
    return {err: ast.err};
  let meta = {};
  meta.type = ast.type;
  if (ast.requires.length)
    meta.requires = ast.requires;
  if (ast.imports.length)
    meta.imports = ast.imports;
  if (ast.imports_dyn.length)
    meta.imports_dyn = ast.imports_dyn;
  if (ast.has.export_default)
    meta.export_default = ast.has.export_default;
  return meta;
}


function test_ast(){
  let t = (js, v)=>{
    let node = parser.parse(js, {sourceType: 'script'});
    let ret;
    traverse(node, {enter(path){
      let p = path.get('body.0.expression');
      ret = ast_is_static(p);
      path.stop();
    }});
    assert_obj(v, ret);
  };
  t(`process.env.NODE_ENV === 'production'`, true);
  t(`process.env.NODE_ENV !== 'development'`, true);
  t(`!!process.env.FEATURE_FLAG`, true);
  t(`process.env.API_URL && process.env.NODE_ENV === 'production'`, true);
  t(`!process.env.DISABLE_LOGGING`, true);
  t(`process.env.NODE_ENV == 'test' || process.env.CI`, true);
  t(`process.env.NODE_ENV === getMode()`, false);
  t(`process.config.NODE_ENV`, false);
  t(`window.process?.env?.NODE_ENV`, false);
  t(`process.env.NODE_ENV?.length > 0`, false);
  t(`process.env['NODE_ENV']`, true);
  t(`typeof process !== 'undefined'`, false);
  t(`process.env.NODE_ENV==='production'; var xxx;`, true);
  t(`process.env.NODE_ENV==='production'; var process;`, false);
  t = (js, v)=>assert_obj(v, tr_js_to_meta(js));
  t(`import "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: null, module: 'lif', start: 7, end: 12}]
    });
  t(`import a from "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: null, module: 'lif', start: 14, end: 19}]
    });
  t(`import {a, b} from "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: ['a', 'b'], module: 'lif', start: 19,
        end: 24}]
    });
  t(`export {a, b} from "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: ['a', 'b'], module: 'lif', start: 19,
        end: 24}]
    });
  t(`export * from "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: null, module: 'lif', start: 14, end: 19}]
    });
  t(`import * as a from "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: null, module: 'lif', start: 19, end: 24}]
    });
  t(`export * as a from "lif";`,
    {type: 'mjs', imports: [
      {type: 'program', imported: null, module: 'lif', start: 19, end: 24}]
    });
  // XXX in the future we may want to also include a['xx'] as a.xx
  t(`import * as a from "lif"; let b = a.A || a.AA || a['xx'] || a[x]; let x;`,
    {type: 'mjs', imports: [
      {type: 'program', imported: ['A', 'AA'], module: 'lif',
        start: 19, end: 24}]
    });
  t(`export * as a from "lif"; let b = a.A || a.AA || a['xx'] || a[x]; let x;`,
    {type: 'mjs', imports: [
      {type: 'program', imported: ['A', 'AA'], module: 'lif',
        start: 19, end: 24}]
    });
  t(`module.exports = {api: ()=>{}};`, {type: 'cjs'});
  t(`export function a(){}`, {type: 'mjs'});
  t(`export const a = 180;`, {type: 'mjs'});
  t(`export default 180;`, {type: 'mjs', export_default: true});
  // double space between await and import, to prevent tr import_module
  t(`let a = await  import("a");`,
    {type: 'mjs', imports_dyn: [{start: 15, end: 21}]});
  t(`let a;
    if (process.env.node_backend=="js")
      a = require("a-js");
    else
      a = require("a");`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'program', start: 57, end: 72,
        cond: {else: false, static: true, start: 15, end: 45}},
      {module: 'a', type: 'program', start: 93, end: 105,
        cond: {else: true, static: true, start: 15, end: 45}},
    ]});
  t(`let process;
    if (process.env.node_backend=="js")
      a = require("a-js");
    else
      a = require("a");`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'program', start: 63, end: 78,
        cond: {else: false, static: false, start: 21, end: 51}},
      {module: 'a', type: 'program', start: 99, end: 111,
        cond: {else: true, static: false, start: 21, end: 51}},
    ]});
  t(`let process;
    if (process.env.node_backend=="js"){
      a = require("a-js");
    } else {
      a = require("a");
    }`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'program', start: 64, end: 79,
        cond: {else: false, static: false, start: 21, end: 51}},
      {module: 'a', type: 'program', start: 104, end: 116,
        cond: {else: true, static: false, start: 21, end: 51}},
    ]});
  t(`function load(){ let a = require("a-js"); }`,
    {type: 'cjs', requires: [
      {module: 'a-js', type: 'sync', start: 25, end: 40}
    ]});
}
test_ast();

