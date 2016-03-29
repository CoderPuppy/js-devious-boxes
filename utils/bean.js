var bean = require('bean')

bean.ctx = function() {
	var ctx = {}

	var ehs = []
	function add(a) {
		ehs.push(a)
		apply(a)
	}

	function apply(a) {
		if(!enabled) return
		bean[a[0]].apply(bean, a.slice(1))
	}

	function unapply(a) {
		if(enabled) return
		bean.off.apply(bean, a.slice(1))
	}

	ctx.on = function() {
		var a = ['on']
		for(var i = 0; i < arguments.length; i++) a[i + 1] = arguments[i]
		add(a)
	}

	ctx.one = function() {
		var a = ['one']
		for(var i = 0; i < arguments.length; i++) a[i + 1] = arguments[i]
		add(a)
	}

	var enabled = false
	ctx.enable  = function() { enabled =  true; ehs.forEach(  apply) }
	ctx.disable = function() { enabled = false; ehs.forEach(unapply) }

	return ctx
}

module.exports = bean
