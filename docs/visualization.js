// https://github.com/hacker-bastl/git-api-d3js-test#readme

const githubModel = {
  networkData: {
    ids: new Map(),
    nodes: [],
    links: [],
  },

  // TODO: refactor, this is redundant w/ d3 data model
  uniqueNode: function(data, type) {
    if (!data.id) {
      console.warn(data);
      console.error('data id missing');
      data.id = String(Math.random()).slice(-8);
    }

    if (!!type) data.type = type;
    if (!data.type) data.type = 'unknown';

    if (githubModel.networkData.ids.has(data.id))
      return githubModel.networkData.ids.get(data.id);
    githubModel.networkData.ids.set(data.id, data);
    githubModel.networkData.nodes.push(data);
    return data;
  },

  // TODO: refactor, wrong abstraction here
  connectNode: function(data, type) {
    var connection = {
      source: githubModel.uniqueNode(data, type),
      timestamp: function(timestamp) {
        var date = (timestamp || 'unknown').substring(0, 10);
        if (date.length != 10) console.warn(timestamp); // TODO
        var node = githubModel.uniqueNode({
          name: date,
          id: date,
        }, 'date');
        return connection.connect(node);
      },
      connect: function(data, type) {
        githubModel.networkData.links.push({
          target: githubModel.uniqueNode(data, type),
          source: connection.source,
        });
        return connection;
      },
    };
    return connection;
  },

  // TODO: refactor, this is redundant w/ d3 data model
  clearContents: function() {
    while (githubModel.networkData.links.length > 0)
      delete(githubModel.networkData.links.pop());
    while (githubModel.networkData.nodes.length > 0)
      delete(githubModel.networkData.nodes.pop());
    githubModel.networkData.ids.clear();
    return githubModel;
  },

};

// TODO: how to abstract this properly?
githubModel.repository = function(data) {
  var repo = githubModel.connectNode(data, 'repo');
  repo.timestamp(data.updated_at || data.created_at);
  data.owner.name = data.owner.login;
  repo.connect(data.owner, 'user');
  return repo;
};

// TODO: how to abstract this properly?
githubModel.event = function(data) {
  var event = githubModel.connectNode(data, 'event');
  event.timestamp(data.updated_at || data.created_at);

  // TODO: refactur / extract to own parsers
  if (!!data.actor) {
    data.actor.name = data.actor.login;
    event.connect(data.actor, 'user');
  }
  if (!!data.org) {
    data.org.name = data.org.login;
    event.connect(data.org, 'orga');
  }
  if (!!data.repo)
    event.connect(data.repo, 'repo');
  //    if (!!data.payload)
  //      event.connect(data.payload);
  return event;
};

// https://bl.ocks.org/mbostock/1095795 / GPLv3
const networkGraph = new function() {
  var root = d3.select('svg').attr('x', 0).attr('y', 0).attr('width', window.innerWidth).attr('height', window.innerHeight);
  var canvas = root.append('g').attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ')');
  var zoom = 1; // TODO: smells...

  // public data pointers to graph data
  this.links = canvas.selectAll('line');
  this.nodes = canvas.selectAll('g');

  // http://bl.ocks.org/aaizemberg/78bd3dade9593896a59d
  this.color = d3.scaleOrdinal(d3.schemeCategory20c);

  // update overall transformation on resize
  d3.select(window).on('resize', function() {
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
    root.attr('width', window.innerWidth).attr('height', window.innerHeight);
  });

  // https://github.com/d3/d3-zoom#zoom
  root.call(d3.zoom().scaleExtent([0.2, 2.0]).on('zoom', function() {
    zoom = d3.event.transform.k;
    canvas.attr('transform', 'translate(' + window.innerWidth / 2 + ',' + window.innerHeight / 2 + ') scale(' + zoom + ')');
  }));
};

// https://github.com/d3/d3-force/#forceSimulation
networkGraph.layout = d3.forceSimulation(githubModel.networkData.nodes)
  .force('x', d3.forceX()).force('y', d3.forceY()).alphaTarget(1)
  // https://github.com/d3/d3-force/#manyBody_strength
  .force('charge', d3.forceManyBody().strength(10 * -30))
  // https://github.com/d3/d3-force/#link_distance
  .force('link', d3.forceLink(githubModel.networkData.links).distance(5 * 30))
  // https://github.com/d3/d3-force/#simulation_tick
  .on('tick', function() {
    networkGraph.nodes.attr('transform', function(d) {
      return 'translate(' + d.x + ',' + d.y + ')';
    });
    networkGraph.links.attr('x1', function(d) {
      return d.source.x;
    }).attr('y1', function(d) {
      return d.source.y;
    }).attr('x2', function(d) {
      return d.target.x;
    }).attr('y2', function(d) {
      return d.target.y;
    });
  });

// https://bl.ocks.org/mbostock/3808218
networkGraph.update = function() {
  networkGraph.nodes = networkGraph.nodes.data(githubModel.networkData.nodes, function(d) {
    return d.id;
  });
  networkGraph.nodes.exit().remove();
  networkGraph.nodes = networkGraph.nodes.enter().append('g').merge(networkGraph.nodes);

  // TODO: use avatar instead?
  networkGraph.nodes.append('circle').attr('fill', function(d) {
    return networkGraph.color(d.type || d.id);
  }).attr('r', 8);

  // TODO: use title as well / instead?
  networkGraph.nodes.append('text').text(function(d) {
    return d.name || d.type || d.id;
  }).attr('y', '0.5em');

  // hook up onclick eventhandler
  networkGraph.nodes.on('click', networkGraph.click);

  // update links
  networkGraph.links = networkGraph.links.data(githubModel.networkData.links, function(d) {
    return d.source.id + '-' + d.target.id;
  });
  networkGraph.links.exit().remove();
  networkGraph.links = networkGraph.links.enter().insert('line', 'g').merge(networkGraph.links);
  // restart layoput
  networkGraph.layout.nodes(githubModel.networkData.nodes);
  networkGraph.layout.force('link').links(githubModel.networkData.links);
  networkGraph.layout.alpha(1).restart();
};

// initial layout start
d3.select(window).on('load', networkGraph.update);

// TODO: use onhover options instead?
networkGraph.click = function(node) {
  if (d3.event.shiftKey && !!node.html_url)
    return setTimeout(function() {
      open(node.html_url, '_new');
    }, 2E2);

  // TODO: "expand" data
  console.info(node);
};

// https://help.github.com/articles/search-syntax/
networkGraph.search = function(text) {
  githubModel.clearContents();
  networkGraph.update();
  d3.json('//api.github.com/search/repositories?q=' + text, function(error, result) {
    if (!!error) throw error;
    result.items.forEach(githubModel.repository);
    networkGraph.update();
  });
};

// https://developer.github.com/v3/activity/events/#list-public-events
d3.select(window).on('load', function() {
  d3.json('//api.github.com/events', function(error, events) {
    if (!!error) throw error;
    events.forEach(githubModel.event);
    networkGraph.update();
  });
});

// d3.select(window).on doesn't work here - why?
window.addEventListener('load', function() {
  var input = document.querySelector('[role=search]>input[type=text]');
  var timeout = null;
  input.addEventListener('keyup', function() {
    clearTimeout(timeout);
    timeout = setTimeout(function() {
      var query = input.value.trim();
      if (query.length > 2)
        networkGraph.search(query);
    }, 1E3);
  });
});
