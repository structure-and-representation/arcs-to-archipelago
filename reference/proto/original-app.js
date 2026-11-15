$(document).ready(function(){


var Eventer = function() {

    if( !(this instanceof Eventer) ) {
        return new Eventer();
    }

    cache = {};

    this.publish = function(topic, args){
        if(typeof cache[topic] === 'object') {    
            cache[topic].forEach(function(property){
                property.apply(this, args || []);
            });
        }
    };

    this.subscribe = function(topic, callback){
        if(!cache[topic]){
            cache[topic] = [];
        }
        cache[topic].push(callback);
        return [topic, callback]; 
    };

    this.unsubscribe = function(topic, fn){
        if( cache[topic] ) {
            cache[topic].forEach(function(element, idx){
                if(element == fn){
                    cache[topic].splice(idx, 1);
                }
            });
        }
    };

    this.queue = function() {
        return cache;
    };

    // alias
    this.on      = this.subscribe;
    this.off     = this.unsubscribe;
    this.trigger = this.publish;

  return this;
};

var eventer = new Eventer;


/* ---------------
init view port
--------------- */
var width = 1200, height = 500;
var margin = {top: 20, right: 20, bottom: 20, left: 20},
    g_width  = width  - margin.left - margin.right,
    g_height = height - margin.top - margin.bottom;

var svgContainer = d3.select("#svgContainer").append("svg")
    .attr("width", g_width + margin.left + margin.right)
    .attr("height", g_height + margin.top + margin.bottom)
    .attr("viewBox", "0 0 1200 500")
    .attr("preserveAspectRatio", "xMidYMid")
    .attr("id", "chartArea")
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

var gPath =   svgContainer.append("g").attr("id", "gPath");
var gCircle = svgContainer.append("g").attr("id", "gCircle");
var gText =   svgContainer.append("g").attr("id", "gText");


/* ---------------
utility: window resize
--------------- */
var _chart = $("#chartArea"),
    aspect = _chart.width() / _chart.height(),
    container = _chart.parent();

$(window).on("resize", function() {
    console.log("resized");
    var targetWidth = container.width();
    q_width = targetWidth;
    g_height = Math.round(targetWidth / aspect);
    _chart.attr("width", q_width);
    _chart.attr("height", g_height);

}).trigger("resize");


/* ---------------
data manager
--------------- */
dataManage = d3.dataManager();
dataManage();


var Graph = function() {

    var self = this;
    this.e = new Eventer;
    var rawData;
    var arcDiagram;
    var widthScale;

    this.init = function() {
        this.e.subscribe( 'load', this.getData );
        this.e.subscribe( 'draw:first', this.drawDots );
        this.e.subscribe( 'draw:lines', this.drawLines );

        this.e.publish( 'load' );
    };

	/* menu */
	var menuNum = 8;

	var menuItems = d3.select("#radioBlock").append('form').selectAll("span")
	    .data( dataManage.prefArray() )
	    .enter().append("span").attr("class", "navColumn");

	menuItems.append("input")
	    .attr({
	        type: "radio",
	        class: "nav",
	        name: "nav",
	        value: function(d, i) {return i;}
	    })
		.attr('id', function(d, i) {
			return "id" + i;
		})
		.attr('value', function(d, i) {
			return dataManage.prefArray()[i];
		})
	    .property("checked", function(d, i) { 
		    if (i === menuNum) { return true; } else { return false; };
	    })
		.on("change", function(d,i){
	      	menuNum = i;
	      	self.e.publish('draw:lines');
	});

	menuItems.append("label")
		.attr('for', function(d, i) {
			return "id" + i;
		})
		.text(function(d,i) {
			return dataManage.preLabel()[i];
		});


    this.getData = function() {

        d3.json('data.json', function(error, _data){

        	rawData = _data;

			arcDiagram = d3.layout.arcDiagram()
				.size([g_width,g_height/2])
				.nodes(rawData.nodes)
				.links(rawData.links)
				.nodeID(function (d) {return d.name});
			arcDiagram();

			widthScale = d3.scale.linear()
			      .domain([0, 12000])
			      .range([0, 20]);

            self.e.publish('draw:first');
        })
    };


    this.drawDots = function() {

        /* draw dot */
        gCircleDraw = gCircle.selectAll("circle")
              .data(rawData.nodes)
              .enter()
              .append("circle")
              .attr("class", "node");

        gCircleDraw
              .attr("r", 2)
              .style("fill", "#666")
              .style("stroke", "#333")
              .style("stroke-width", "1px")
              .attr("cx", function (d) {return d.x;})
              .attr("cy", function (d) {return d.y});

        /* draw text */
        gTextDraw = gText.selectAll("desc")
              .data(rawData.nodes)
              .enter()
              .append("text")
              .attr("class", "desc");

        gTextDraw
              .style("fill", "#333")
              .attr("dx", "0.6em")
              .attr("dy", "0.8em")
              .attr("text-anchor", "middle")
              .attr("transform", function(d, i) { return "translate(" + d.x+",15) rotate(45) "; })
              // .attr("transform", function(d, i) { return "translate(" + d.x+"," + d.y + ") rotate(45) "; })
              .attr("font-size", "10px")
              .text( function (d) { return d.name });

        self.e.publish('draw:lines');
	};


    this.drawLines = function() {

  		/* draw path */
  		gPathDraw = gPath.selectAll("path")
  		     .data(rawData.links);

  		gPathDraw       
  		     .enter()
  		     .append("path")
  		     .attr("class", "arc")
      		 .style("stroke", "#FFFFFF")
  		     .style("stroke-width", "0.2px")
  		     .style("opacity", .1)
  		     .style("stroke-linecap", "round")
  		     .style("fill", "none");

  		gPathDraw
  		    .transition().duration(2000).delay( function (d,i) { return i*2; })
  		    .style("stroke", function (d) {
  		    	if (menuNum==8) { // 8
  		    		return "#333";
  		    	} else if ((menuNum<4) && (menuNum>-1)) { // 0-3
  			        for (var j=0; j < dataManage.prefArray()[menuNum].length; j++){
  			            if (d.target.name == dataManage.prefArray()[menuNum][j]){
  		    				return "#333";
  			            }
  			        };
  		    	} else { // 4-7
  			        for (var j=0; j < dataManage.prefArray()[menuNum].length; j++){
  			            if (d.source.name == dataManage.prefArray()[menuNum][j]){
  		    				return "#333";
  			            }
  			        };
  		    	};
  		    })
  		    .style("stroke-width", function (d) {
  		        // console.log(d.value);
  		        return widthScale(d.value);
  		    })
  		    .attr("d", arcDiagram.arc);

      gPathDraw.exit().remove();
	};

	this.init.apply( this, arguments );
};

new Graph;

});