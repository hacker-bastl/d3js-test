var model = new function() {

  this.data = {
    nodes: [],
    links: [],
  };

  this.remove = function(node) {
    model.data.links = model.data.links.filter(function(link) {
      return link.target.id != node.id && link.source.id != node.id;
    });
    model.data.nodes = model.data.nodes.filter(function(entry) {
      return entry.id != node.id;
    });
    return this;
  };

  this.clear = function() {
    this.data.nodes = [];
    this.data.links = [];
  };

  this.link = function(a, b) {
    model.data.links.push({
      source: a,
      target: b,
    });
    return this;
  };

};

// https://bl.ocks.org/mbostock/1095795 / GPLv3

var graph = new function() {
  var root = d3.select('svg').attr('x', 0).attr('y', 0).attr('width', window.innerWidth).attr('height', window.innerHeight);
  var canvas = root.append('g').attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')');
  d3.select(window).on('resize', function() {
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')'); // TODO: get and set zoom here!?
    root.attr('width', window.innerWidth).attr('height', window.innerHeight);
  });
  this.links = canvas.selectAll('line');
  this.nodes = canvas.selectAll('g');
  this.color = d3.scaleOrdinal(d3.schemeCategory10);
  // https://github.com/d3/d3-zoom#zoom
  root.call(d3.zoom().scaleExtent([0.2, 2.0]).on('zoom', function() {
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')' +
      ' scale(' + d3.event.transform.k + ')');
  }));
  // https://github.com/d3/d3-force/#forceSimulation
  this.layout = d3.forceSimulation(model.data.nodes)
    .force('x', d3.forceX()).force('y', d3.forceY()).alphaTarget(1)
    // https://github.com/d3/d3-force/#manyBody_strength
    .force('charge', d3.forceManyBody().strength(10 * -30))
    // https://github.com/d3/d3-force/#link_distance
    .force('link', d3.forceLink(model.data.links).distance(5 * 30))
    // https://github.com/d3/d3-force/#simulation_tick
    .on('tick', function() {
      graph.nodes.attr('transform', function(d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      });
      graph.links.attr('x1', function(d) {
        return d.source.x;
      }).attr('y1', function(d) {
        return d.source.y;
      }).attr('x2', function(d) {
        return d.target.x;
      }).attr('y2', function(d) {
        return d.target.y;
      });
    });
};

graph.click = function(node) {
  if (d3.event.shiftKey) return model.remove(node);
  console.info(node);
};

graph.update = function() {
  graph.nodes = graph.nodes.data(model.data.nodes, function(d) {
    return d.id;
  });
  graph.nodes.exit().remove();
  graph.nodes = graph.nodes.enter().append('g').merge(graph.nodes);

  graph.nodes.on('click', graph.click);
  graph.nodes.append('circle').attr('fill', function(d) {
    return graph.color(d.type || d.id);
  }).attr('r', 8);
  graph.nodes.append('text').text(function(d) {
    return d.name || d.id;
  });

  graph.links = graph.links.data(model.data.links, function(d) {
    return d.source.id + '-' + d.target.id;
  });
  graph.links.exit().remove();
  graph.links = graph.links.enter().insert('line', 'g').merge(graph.links);

  graph.layout.nodes(model.data.nodes);
  graph.layout.force('link').links(model.data.links);
  graph.layout.alpha(1).restart();
};

graph.update();

// https://help.github.com/articles/search-syntax/
graph.search = function(text) {
  model.clear();
  graph.update();
  d3.json('//api.github.com/search/repositories?q=' + text, function(error, code) {
    if (!!error) throw error;
    code.items.forEach(function(entry) {
      model.data.nodes.push(entry);
      model.data.nodes.push(entry.owner);
      model.link(entry.owner, entry);
      var date = {
        id: (entry.updated_at || entry.created_at).substring(0, 10)
      };
      model.data.nodes.push(date);
      model.link(date, entry)

    });
    graph.update();
  });
};

window.addEventListener('load', function() {
  var timeout = null;
  document.querySelector('form[role=search]').addEventListener('submit', function() {
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      var query = document.querySelector('form[role=search] input[type=text]').value.trim();
      if (query.length > 1) graph.search(query);
    }, 1E3);
  });
});

d3.json('//api.github.com/events', function(error, events) {
  if (!!error) throw error;
  events.forEach(function(event) {

    event.name = event.type;
    model.data.nodes.push(event);

    var date = {
      id: event.created_at.substring(0, 10)
    };

    model.data.nodes.push(date);
    model.link(date, event)

    model.data.nodes.push(event.actor);
    model.link(event.actor, event)

    model.data.nodes.push(event.repo);
    model.link(event.repo, event)

    if (!!event.org)
      model.link(event.repo, event.org)

    event.payload.name = event.payload.action;
    model.data.nodes.push(event.payload);
    model.link(event.payload, event)

  });
  graph.update();
});
